use serde_json::{Value as J, json};
mod guided;
#[cfg(target_arch = "wasm32")]
mod wasm;
use std::{
    collections::{HashMap, HashSet},
    ffi::{CStr, CString},
    os::raw::c_char,
};

#[derive(Clone, Debug, PartialEq)]
pub enum Value {
    Num(f64),
    Text(String),
    Bool(bool),
    Blank,
    Error(String),
    Range(Vec<Vec<Value>>),
}
impl Value {
    fn n(&self) -> Result<f64, Value> {
        match self {
            Self::Num(n) => Ok(*n),
            Self::Bool(b) => Ok(if *b { 1.0 } else { 0.0 }),
            Self::Blank => Ok(0.0),
            Self::Text(s) if s.is_empty() => Ok(0.0),
            Self::Text(s) => s
                .replace(',', ".")
                .parse()
                .map_err(|_| Self::Error("#VALUE!".into())),
            Self::Error(_) => Err(self.clone()),
            _ => Err(Self::Error("#VALUE!".into())),
        }
    }
    fn truth(&self) -> Result<bool, Value> {
        self.n().map(|n| n != 0.0)
    }
    pub fn text(&self) -> String {
        match self {
            Self::Num(n) => format!("{n}"),
            Self::Text(s) | Self::Error(s) => s.clone(),
            Self::Bool(b) => if *b { "TRUE" } else { "FALSE" }.into(),
            Self::Blank => String::new(),
            Self::Range(_) => "#RANGE!".into(),
        }
    }
    fn json(&self) -> J {
        match self {
            Self::Num(n) => json!(n),
            Self::Bool(b) => json!(b),
            Self::Blank => J::Null,
            _ => json!(self.text()),
        }
    }
}
fn num(n: f64) -> Value {
    if n.is_finite() {
        Value::Num(n)
    } else {
        Value::Error("#NUM!".into())
    }
}
fn err(s: &str) -> Value {
    Value::Error(s.into())
}
fn compare(a: &Value, b: &Value) -> std::cmp::Ordering {
    match (a, b) {
        (Value::Text(x), Value::Text(y)) => x.to_lowercase().cmp(&y.to_lowercase()),
        (Value::Blank, Value::Text(s)) => "".cmp(s),
        (Value::Text(s), Value::Blank) => s.as_str().cmp(""),
        _ => match (a.n(), b.n()) {
            (Ok(x), Ok(y)) => x.total_cmp(&y),
            _ => a.text().to_lowercase().cmp(&b.text().to_lowercase()),
        },
    }
}
#[derive(Clone, Debug)]
enum Expr {
    Val(Value),
    Ref(String),
    Unary(char, Box<Expr>),
    Binary(String, Box<Expr>, Box<Expr>),
    Call(String, Vec<Expr>),
}
#[derive(Clone, Debug, PartialEq)]
enum Tok {
    Number(f64),
    Text(String),
    Ref(String),
    Name(String),
    Op(String),
    Left,
    Right,
    Sep,
    End,
}
struct Parser {
    toks: Vec<Tok>,
    p: usize,
}
impl Parser {
    fn new(s: &str) -> Result<Self, String> {
        // Four source cells contain a duplicate leading '=' accepted by Calc.
        let chars: Vec<char> = s
            .strip_prefix("of:=")
            .unwrap_or(s)
            .trim_start_matches('=')
            .chars()
            .collect();
        let mut p = 0;
        let mut toks = vec![];
        while p < chars.len() {
            let c = chars[p];
            if c.is_whitespace() {
                p += 1;
                continue;
            }
            if c == '[' {
                p += 1;
                let start = p;
                while p < chars.len() && chars[p] != ']' {
                    p += 1
                }
                if p == chars.len() {
                    return Err("Unclosed reference".into());
                }
                toks.push(Tok::Ref(chars[start..p].iter().collect()));
                p += 1;
                continue;
            }
            if c == '"' {
                p += 1;
                let mut s = String::new();
                loop {
                    if p >= chars.len() {
                        return Err("Unclosed string".into());
                    }
                    if chars[p] == '"' {
                        p += 1;
                        if p < chars.len() && chars[p] == '"' {
                            s.push('"');
                            p += 1;
                        } else {
                            break;
                        }
                    } else {
                        s.push(chars[p]);
                        p += 1
                    }
                }
                toks.push(Tok::Text(s));
                continue;
            }
            if c.is_ascii_digit() || c == '.' {
                let start = p;
                p += 1;
                while p < chars.len() && (chars[p].is_ascii_digit() || chars[p] == '.') {
                    p += 1
                }
                toks.push(Tok::Number(
                    chars[start..p]
                        .iter()
                        .collect::<String>()
                        .parse()
                        .map_err(|_| "Bad number")?,
                ));
                continue;
            }
            if c.is_alphabetic() || c == '_' {
                let start = p;
                p += 1;
                while p < chars.len() && (chars[p].is_alphanumeric() || "_.".contains(chars[p])) {
                    p += 1
                }
                toks.push(Tok::Name(chars[start..p].iter().collect()));
                continue;
            }
            p += 1;
            toks.push(match c {
                '(' => Tok::Left,
                ')' => Tok::Right,
                ';' | ',' => Tok::Sep,
                _ => {
                    let mut op = c.to_string();
                    if p < chars.len()
                        && ((c == '<' && ">=".contains(chars[p])) || (c == '>' && chars[p] == '='))
                    {
                        op.push(chars[p]);
                        p += 1
                    }
                    Tok::Op(op)
                }
            });
        }
        toks.push(Tok::End);
        Ok(Self { toks, p: 0 })
    }
    fn peek(&self) -> &Tok {
        self.toks.get(self.p).unwrap_or(&Tok::End)
    }
    fn pop(&mut self) -> Tok {
        let t = self.peek().clone();
        self.p += 1;
        t
    }
    fn expr(&mut self, min: u8) -> Result<Expr, String> {
        let mut left = match self.pop() {
            Tok::Number(n) => Expr::Val(Value::Num(n)),
            Tok::Text(s) => Expr::Val(Value::Text(s)),
            Tok::Ref(r) => Expr::Ref(r),
            Tok::Op(op) if op == "-" || op == "+" => {
                Expr::Unary(op.chars().next().unwrap(), Box::new(self.expr(5)?))
            }
            Tok::Left => {
                let e = self.expr(0)?;
                if self.pop() != Tok::Right {
                    return Err("Expected )".into());
                }
                e
            }
            Tok::Name(n) => {
                if *self.peek() == Tok::Left {
                    self.pop();
                    let mut args = vec![];
                    if *self.peek() != Tok::Right {
                        loop {
                            args.push(self.expr(0)?);
                            if *self.peek() != Tok::Sep {
                                break;
                            }
                            self.pop();
                        }
                    }
                    if self.pop() != Tok::Right {
                        return Err("Expected function )".into());
                    }
                    Expr::Call(n.to_uppercase(), args)
                } else {
                    match n.as_str() {
                        "TRUE" => Expr::Val(Value::Bool(true)),
                        "FALSE" => Expr::Val(Value::Bool(false)),
                        _ => return Err(format!("Unknown name {n}")),
                    }
                }
            }
            t => return Err(format!("Unexpected {t:?}")),
        };
        loop {
            let Tok::Op(op) = self.peek().clone() else {
                break;
            };
            if op == "%" {
                self.pop();
                left = Expr::Binary(
                    "/".into(),
                    Box::new(left),
                    Box::new(Expr::Val(Value::Num(100.0))),
                );
                continue;
            }
            let prec = match op.as_str() {
                "=" | "<>" | "<" | ">" | "<=" | ">=" => 1,
                "&" => 2,
                "+" | "-" => 3,
                "*" | "/" => 4,
                "^" => 6,
                _ => break,
            };
            if prec < min {
                break;
            }
            self.pop();
            let right = self.expr(if op == "^" { prec } else { prec + 1 })?;
            left = Expr::Binary(op, Box::new(left), Box::new(right));
        }
        Ok(left)
    }
    fn parse(s: &str) -> Result<Expr, String> {
        let mut p = Self::new(s)?;
        let e = p.expr(0)?;
        if *p.peek() != Tok::End {
            return Err(format!("Remaining tokens {:?}", p.peek()));
        }
        Ok(e)
    }
}

pub struct Engine {
    pub source: J,
    cells: HashMap<String, J>,
    ast: HashMap<String, Expr>,
    memo: HashMap<String, Value>,
    visiting: HashSet<String>,
    overrides: HashMap<String, Value>,
    pub parse_errors: Vec<String>,
}
impl Engine {
    pub fn new() -> Self {
        let source: J = serde_json::from_str(include_str!("../evidence/workbooks.json")).unwrap();
        let mut cells = HashMap::new();
        let mut ast = HashMap::new();
        let mut parse_errors = vec![];
        for (wi, w) in source.as_array().unwrap().iter().enumerate() {
            for (si, s) in w["sheets"].as_array().unwrap().iter().enumerate() {
                for c in s["cells"].as_array().unwrap() {
                    let key = format!("{wi}:{si}:{}", c["cell"].as_str().unwrap());
                    if let Some(f) = c["formula"].as_str() {
                        match Parser::parse(f) {
                            Ok(e) => {
                                ast.insert(key.clone(), e);
                            }
                            Err(e) => parse_errors.push(format!("{key}: {e}")),
                        }
                    }
                    cells.insert(key, c.clone());
                }
            }
        }
        Self {
            source,
            cells,
            ast,
            memo: HashMap::new(),
            visiting: HashSet::new(),
            overrides: HashMap::new(),
            parse_errors,
        }
    }
    pub fn set(&mut self, w: usize, s: usize, a: &str, v: J) -> Result<(), String> {
        let key = format!("{w}:{s}:{a}");
        if self.ast.contains_key(&key) {
            return Err(format!("Cannot overwrite calculated cell {a}"));
        }
        let val = match v {
            J::Number(n) => Value::Num(n.as_f64().ok_or("Invalid number")?),
            J::Bool(b) => Value::Bool(b),
            J::Null => Value::Blank,
            J::String(s) => Value::Text(s),
            _ => return Err("Expected scalar".into()),
        };
        let val = if let Value::Num(n) = val {
            if let Some(d) = self.cells.get(&key).and_then(|c| c["precision"].as_i64()) {
                let factor = 10f64.powi(d as i32);
                num((n * factor).round() / factor)
            } else {
                num(n)
            }
        } else {
            val
        };
        self.overrides.insert(key, val);
        self.memo.clear();
        Ok(())
    }
    pub fn get(&mut self, w: usize, s: usize, a: &str) -> Value {
        self.cell(&format!("{w}:{s}:{a}"))
    }
    fn cell(&mut self, key: &str) -> Value {
        if let Some(v) = self.overrides.get(key) {
            return v.clone();
        }
        if let Some(v) = self.memo.get(key) {
            return v.clone();
        }
        if !self.visiting.insert(key.into()) {
            return err("#CIRC!");
        }
        let v = if let Some(e) = self.ast.get(key).cloned() {
            let prefix = key.rsplit_once(':').unwrap().0;
            self.eval(&e, prefix)
        } else if let Some(c) = self.cells.get(key) {
            if c["formula"].is_string() {
                err("#PARSE!")
            } else if let Some(n) = c["value"].as_str().and_then(|n| n.parse::<f64>().ok()) {
                num(n)
            } else {
                let t = c["text"].as_str().unwrap_or("");
                if t.is_empty() {
                    Value::Blank
                } else {
                    Value::Text(t.into())
                }
            }
        } else {
            Value::Blank
        };
        let v = if v == Value::Blank && self.ast.contains_key(key) {
            Value::Num(0.0)
        } else {
            v
        };
        let v = if let Value::Num(n) = v {
            if let Some(d) = self.cells.get(key).and_then(|c| c["precision"].as_i64()) {
                let factor = 10f64.powi(d as i32);
                num((n * factor).round() / factor)
            } else {
                num(n)
            }
        } else {
            v
        };
        self.visiting.remove(key);
        self.memo.insert(key.into(), v.clone());
        v
    }
    fn reference(&mut self, r: &str, prefix: &str) -> Value {
        let norm = |s: &str| s.trim().trim_start_matches('.').replace('$', "");
        let parts: Vec<_> = r.split(':').collect();
        if parts.len() == 1 {
            return self.cell(&format!("{prefix}:{}", norm(r)));
        }
        fn coords(a: &str) -> Option<(usize, usize)> {
            let mut col = 0;
            let mut row = String::new();
            for c in a.chars() {
                if c.is_ascii_uppercase() {
                    col = col * 26 + (c as usize - 'A' as usize + 1)
                } else if c.is_ascii_digit() {
                    row.push(c)
                } else {
                    return None;
                }
            }
            Some((col, row.parse().ok()?))
        }
        let Some((c1, r1)) = coords(&norm(parts[0])) else {
            return err("#REF!");
        };
        let Some((c2, r2)) = coords(&norm(parts[1])) else {
            return err("#REF!");
        };
        if c2 < c1 || r2 < r1 || (c2 - c1 + 1) * (r2 - r1 + 1) > 100000 {
            return err("#REF!");
        }
        Value::Range(
            (r1..=r2)
                .map(|row| {
                    (c1..=c2)
                        .map(|col| self.cell(&format!("{prefix}:{}{row}", column(col))))
                        .collect()
                })
                .collect(),
        )
    }
    fn eval(&mut self, e: &Expr, p: &str) -> Value {
        match e {
            Expr::Val(v) => v.clone(),
            Expr::Ref(r) => self.reference(r, p),
            Expr::Unary(op, e) => match self.eval(e, p).n() {
                Ok(n) => num(if *op == '-' { -n } else { n }),
                Err(e) => e,
            },
            Expr::Binary(op, a, b) => {
                let a = self.eval(a, p);
                let b = self.eval(b, p);
                if matches!(a, Value::Error(_)) {
                    return a;
                }
                if matches!(b, Value::Error(_)) {
                    return b;
                }
                if op == "&" {
                    return Value::Text(a.text() + &b.text());
                }
                if ["=", "<>", "<", ">", "<=", ">="].contains(&op.as_str()) {
                    let c = compare(&a, &b);
                    return Value::Bool(match op.as_str() {
                        "=" => c.is_eq(),
                        "<>" => !c.is_eq(),
                        "<" => c.is_lt(),
                        ">" => c.is_gt(),
                        "<=" => !c.is_gt(),
                        _ => !c.is_lt(),
                    });
                }
                match (a.n(), b.n()) {
                    (Ok(a), Ok(b)) => match op.as_str() {
                        "+" => num(a + b),
                        "-" => num(a - b),
                        "*" => num(a * b),
                        "/" => {
                            if b == 0.0 {
                                err("#DIV/0!")
                            } else {
                                num(a / b)
                            }
                        }
                        "^" => num(a.powf(b)),
                        _ => err("#OP!"),
                    },
                    (Err(e), _) | (_, Err(e)) => e,
                }
            }
            Expr::Call(name, args) => {
                if name == "IF" {
                    if args.len() < 2 {
                        return err("#ARGS!");
                    }
                    return match self.eval(&args[0], p).truth() {
                        Ok(true) => self.eval(&args[1], p),
                        Ok(false) => args
                            .get(2)
                            .map(|a| self.eval(a, p))
                            .unwrap_or(Value::Bool(false)),
                        Err(e) => e,
                    };
                }
                if name == "ISERROR" || name == "ISNA" {
                    return Value::Bool(
                        args.first()
                            .map(|a| {
                                let v = self.eval(a, p);
                                if name == "ISNA" {
                                    v == err("#N/A")
                                } else {
                                    matches!(v, Value::Error(_))
                                }
                            })
                            .unwrap_or(false),
                    );
                }
                let vs: Vec<Value> = args.iter().map(|a| self.eval(a, p)).collect();
                if let Some(e) = vs.iter().find(|v| matches!(v, Value::Error(_))) {
                    return e.clone();
                }
                let n = |i: usize| vs.get(i).ok_or_else(|| err("#ARGS!")).and_then(Value::n);
                match name.as_str() {
                    "SUM" | "MAX" | "MIN" => {
                        let mut nums = vec![];
                        for v in &vs {
                            match v {
                                Value::Range(rows) => {
                                    for row in rows {
                                        for v in row {
                                            match v {
                                                Value::Num(n) => nums.push(*n),
                                                Value::Error(_) => return v.clone(),
                                                _ => {}
                                            }
                                        }
                                    }
                                }
                                _ => match v.n() {
                                    Ok(n) => nums.push(n),
                                    Err(e) => return e,
                                },
                            }
                        }
                        num(if nums.is_empty() {
                            0.0
                        } else if name == "SUM" {
                            nums.iter().sum()
                        } else if name == "MAX" {
                            nums.into_iter().fold(f64::NEG_INFINITY, f64::max)
                        } else {
                            nums.into_iter().fold(f64::INFINITY, f64::min)
                        })
                    }
                    "OR" => {
                        for v in &vs {
                            match v.truth() {
                                Ok(true) => return Value::Bool(true),
                                Err(e) => return e,
                                _ => {}
                            }
                        }
                        Value::Bool(false)
                    }
                    "ROUNDDOWN" | "ROUNDUP" | "TRUNC" => {
                        let a = match n(0) {
                            Ok(n) => n,
                            Err(e) => return e,
                        };
                        let digits = if vs.len() > 1 {
                            match n(1) {
                                Ok(n) => n,
                                Err(e) => return e,
                            }
                        } else {
                            0.0
                        };
                        let f = 10.0f64.powf(digits.trunc());
                        let x = a * f;
                        num((if name == "ROUNDUP" {
                            x.abs().ceil() * x.signum()
                        } else {
                            x.trunc()
                        }) / f)
                    }
                    "MOD" => match (n(0), n(1)) {
                        (Ok(_), Ok(0.0)) => err("#DIV/0!"),
                        (Ok(a), Ok(b)) => num(a - b * (a / b).floor()),
                        (Err(e), _) | (_, Err(e)) => e,
                    },
                    "CONCATENATE" => {
                        Value::Text(vs.iter().map(Value::text).collect::<Vec<_>>().join(""))
                    }
                    "SEARCH" => {
                        if vs.len() < 2 {
                            return err("#ARGS!");
                        }
                        let needle = vs[0].text().to_lowercase();
                        let text = vs[1].text().to_lowercase();
                        let start = if vs.len() > 2 {
                            n(2).unwrap_or(0.0) as usize
                        } else {
                            1
                        };
                        let chars: Vec<_> = text.chars().collect();
                        if start == 0 || start > chars.len() + 1 {
                            return err("#VALUE!");
                        }
                        let sub: String = chars[start - 1..].iter().collect();
                        match sub.find(&needle) {
                            Some(i) => num((start + sub[..i].chars().count()) as f64),
                            None => err("#VALUE!"),
                        }
                    }
                    "VLOOKUP" => {
                        if vs.len() < 3 {
                            return err("#ARGS!");
                        }
                        let Value::Range(rows) = &vs[1] else {
                            return err("#VALUE!");
                        };
                        let col = match n(2) {
                            Ok(n) if n >= 1.0 => n as usize - 1,
                            _ => return err("#REF!"),
                        };
                        let exact = vs.len() > 3 && !vs[3].truth().unwrap_or(true);
                        let mut found = None;
                        for row in rows {
                            if row.is_empty() {
                                continue;
                            }
                            let cmp = compare(&row[0], &vs[0]);
                            if cmp.is_eq() {
                                found = Some(row);
                                break;
                            }
                            if !exact && cmp.is_lt() {
                                found = Some(row)
                            }
                        }
                        match found {
                            Some(row) => row.get(col).cloned().unwrap_or_else(|| err("#REF!")),
                            None => err("#N/A"),
                        }
                    }
                    "MATCH" => {
                        if vs.len() < 2 {
                            return err("#ARGS!");
                        }
                        let Value::Range(rows) = &vs[1] else {
                            return err("#VALUE!");
                        };
                        let mode = if vs.len() > 2 {
                            n(2).unwrap_or(1.0)
                        } else {
                            1.0
                        };
                        let mut found = None;
                        for (i, v) in rows.iter().flatten().enumerate() {
                            let cmp = compare(v, &vs[0]);
                            if cmp.is_eq() {
                                found = Some(i + 1);
                                break;
                            }
                            if (mode > 0.0 && cmp.is_lt()) || (mode < 0.0 && cmp.is_gt()) {
                                found = Some(i + 1)
                            }
                        }
                        found.map(|i| num(i as f64)).unwrap_or_else(|| err("#N/A"))
                    }
                    "COUNTIF" => {
                        if vs.len() < 2 {
                            return err("#ARGS!");
                        }
                        let Value::Range(rows) = &vs[0] else {
                            return err("#VALUE!");
                        };
                        num(rows
                            .iter()
                            .flatten()
                            .filter(|v| compare(v, &vs[1]).is_eq())
                            .count() as f64)
                    }
                    _ => err(&format!("#UNSUPPORTED:{name}")),
                }
            }
        }
    }
    pub fn verify(&mut self) -> J {
        let mut checked = 0;
        let mut matched = 0;
        let mut text_checked = 0;
        let mut text_matched = 0;
        let mut mismatches = vec![];
        let mut errors = vec![];
        let mut source_errors = 0;
        let mut source_errors_matched = 0;
        let cells = self.cells.clone();
        for (key, c) in cells {
            if !c["formula"].is_string() {
                continue;
            }
            let got = self.cell(&key);
            if let Value::Error(e) = &got {
                errors.push(json!({"cell":key,"error":e,"saved":c["text"]}));
            }
            let saved = c["text"].as_str().unwrap_or("");
            if saved.starts_with('#') || saved.starts_with("Err:") {
                source_errors += 1;
                if got.text() == saved
                    || (saved.starts_with("Err:") && matches!(got, Value::Error(_)))
                {
                    source_errors_matched += 1
                }
                continue;
            }
            if let Some(expected) = c["value"].as_str().and_then(|n| n.parse::<f64>().ok()) {
                checked += 1;
                if let Value::Num(n) = got {
                    if (n - expected).abs() <= 1e-8 * expected.abs().max(1.0) {
                        matched += 1;
                        continue;
                    }
                }
                mismatches.push(json!({"cell":key,"expected":expected,"actual":got.json(),"formula":c["formula"]}));
            } else {
                text_checked += 1;
                if got.text() == saved {
                    text_matched += 1
                } else {
                    mismatches.push(json!({"cell":key,"expected":saved,"actual":got.json(),"formula":c["formula"]}));
                }
            }
        }
        mismatches.sort_by_key(|v| v["cell"].as_str().unwrap().to_owned());
        json!({"checked":checked,"matched":matched,"text_checked":text_checked,"text_matched":text_matched,"mismatches":mismatches,"source_errors":source_errors,"source_errors_matched":source_errors_matched,"errors":errors,"parse_errors":self.parse_errors})
    }
}
pub fn column(mut n: usize) -> String {
    let mut s = String::new();
    while n > 0 {
        n -= 1;
        s.insert(0, (b'A' + (n % 26) as u8) as char);
        n /= 26
    }
    s
}

pub fn calculate(request: &J) -> J {
    if request["guided"].as_bool() == Some(true) {
        return guided::quote(request).unwrap_or_else(|error| json!({"error":error}));
    }
    let mut engine = Engine::new();
    let w = request["workbook"].as_u64().unwrap_or(0) as usize;
    let s = request["sheet"].as_u64().unwrap_or(0) as usize;
    if engine
        .source
        .get(w)
        .and_then(|w| w["sheets"].get(s))
        .is_none()
    {
        return json!({"error":"Unknown worksheet"});
    }
    if let Some(map) = request["overrides"].as_object() {
        for (a, v) in map {
            if let Err(e) = engine.set(w, s, a, v.clone()) {
                return json!({"error":e});
            }
        }
    }
    let mut result = serde_json::Map::new();
    if let Some(cells) = request["cells"].as_array() {
        for a in cells.iter().filter_map(J::as_str) {
            result.insert(a.into(), engine.get(w, s, a).json());
        }
    }
    json!({"values":result})
}
#[unsafe(no_mangle)]
pub unsafe extern "C" fn box_calculate(input: *const c_char) -> *mut c_char {
    let output = std::panic::catch_unwind(|| {
        let text = unsafe { CStr::from_ptr(input) }
            .to_str()
            .map_err(|e| e.to_string())?;
        let req: J = serde_json::from_str(text).map_err(|e| e.to_string())?;
        Ok::<_, String>(calculate(&req))
    })
    .unwrap_or_else(|_| Err("Calculation failed".into()));
    CString::new(output.unwrap_or_else(|e| json!({"error":e})).to_string())
        .unwrap()
        .into_raw()
}
#[unsafe(no_mangle)]
pub unsafe extern "C" fn box_free(p: *mut c_char) {
    if !p.is_null() {
        drop(unsafe { CString::from_raw(p) });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn lazy_if() {
        let mut e = Engine::new();
        let x = Parser::parse("of:=IF(1;42;1/0)").unwrap();
        assert_eq!(e.eval(&x, "0:0"), Value::Num(42.0));
    }
    #[test]
    fn labour_quantity_change() {
        let mut e = Engine::new();
        let old = e.get(0, 0, "C4").n().unwrap();
        e.set(0, 0, "C3", json!(4000)).unwrap();
        let new = e.get(0, 0, "C4").n().unwrap();
        assert!(new < old);
        assert!(new > 0.0);
    }
    #[test]
    fn no_stale_zero_quantity() {
        let mut e = Engine::new();
        e.set(0, 0, "C3", json!(0)).unwrap();
        assert!(matches!(e.get(0, 0, "C4"), Value::Error(_)));
    }
    #[test]
    fn formula_overwrite_rejected() {
        let mut e = Engine::new();
        assert!(e.set(0, 0, "C4", json!(1)).is_err());
    }
    #[test]
    fn dimensions_recalculate() {
        let mut e = Engine::new();
        let old = e.get(1, 0, "M5");
        e.set(1, 0, "C3", json!(40)).unwrap();
        assert_ne!(old, e.get(1, 0, "M5"));
    }
    #[test]
    fn all_saved_results_match() {
        let mut e = Engine::new();
        let report = e.verify();
        assert_eq!(report["matched"], report["checked"]);
        assert_eq!(report["text_matched"], report["text_checked"]);
        assert_eq!(report["source_errors_matched"], report["source_errors"]);
        assert_eq!(report["mismatches"], json!([]));
        assert!(report["checked"].as_u64().unwrap() > 6000);
    }
    #[test]
    fn precision_as_shown_applies_to_inputs() {
        let mut e = Engine::new();
        e.set(1, 0, "C3", json!(27.04)).unwrap();
        assert_eq!(e.get(1, 0, "C3"), Value::Num(27.0));
    }
    #[test]
    fn optional_process_changes_cost() {
        let mut e = Engine::new();
        let before = e.get(0, 0, "C4").n().unwrap();
        e.set(0, 0, "E11", json!("ne")).unwrap();
        assert!(e.get(0, 0, "C4").n().unwrap() < before);
    }
}
