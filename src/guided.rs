//! Guided pricing replaces source throughput targets with labour and margin.
use super::{Engine, Value};
use serde_json::{Value as J, json};
const EDITABLE: &[&str] = &[
    "C7", "D7", "C8", "D8", "J7", "J9", "F7", "C15", "D15", "C16", "D16", "C25", "D25", "C26",
    "D26", "C27", "D27", "C31", "D31", "C32", "D32", "F43",
];
fn amount(v: Value, label: &str) -> Result<f64, String> {
    match v {
        Value::Num(n) if n.is_finite() && n >= 0.0 => Ok(n),
        _ => Err(format!(
            "{label}: {}. Check the selected material or dimensions.",
            v.text()
        )),
    }
}
fn input(req: &J, name: &str, default: f64, min: f64, max: f64) -> Result<f64, String> {
    let n = match req.get(name) {
        None => default,
        Some(v) => v
            .as_f64()
            .ok_or_else(|| format!("Enter a number for {name}."))?,
    };
    if !n.is_finite() || n < min || n > max {
        return Err(format!("{name} must be between {min} and {max}."));
    }
    Ok(n)
}
fn active(s: &str) -> bool {
    !matches!(
        s.trim().to_lowercase().as_str(),
        "" | "ne" | "nėra" | "none"
    )
}
fn cents(n: f64) -> f64 {
    (n * 100.0).round() / 100.0
}
pub fn quote(req: &J) -> Result<J, String> {
    let quantity = input(req, "quantity", 2000.0, 1.0, 1_000_000.0)?;
    if quantity.fract() != 0.0 {
        return Err("Quantity must be a whole number.".into());
    }
    let length = input(req, "length_mm", 270.0, 10.0, 1500.0)?;
    let width = input(req, "width_mm", 190.0, 10.0, 1500.0)?;
    let base = input(req, "base_height_mm", 75.0, 5.0, 500.0)?;
    let lid = input(req, "lid_height_mm", 100.0, 5.0, 500.0)?;
    if [length, width, base, lid].iter().any(|n| n.fract() != 0.0) {
        return Err(
            "Enter dimensions in whole millimetres; the source model rounds to 1 mm.".into(),
        );
    }
    let rate = input(req, "hourly_rate", 22.0, 0.01, 10000.0)?;
    let margin = input(req, "margin_percent", 25.0, 0.0, 95.0)? / 100.0;
    let requested_mode = match req.get("production") {
        None => "auto",
        Some(v) => v.as_str().ok_or("Choose a supported production mode.")?,
    };
    if !["auto", "automatic", "semi", "manual"].contains(&requested_mode) {
        return Err("Choose a supported production mode.".into());
    }
    let include_shipping = match req.get("include_shipping") {
        None => false,
        Some(v) => v
            .as_bool()
            .ok_or("Delivery inclusion must be true or false.")?,
    };
    if req.get("box").is_some_and(|v| !v.is_object()) {
        return Err("Box selections must be an object.".into());
    }
    if req.get("compare_quantities").is_some_and(|v| !v.is_array()) {
        return Err("Comparison quantities must be a list.".into());
    }
    let mut e = Engine::new();
    for (cell, n) in [
        ("C3", length / 10.0),
        ("D3", width / 10.0),
        ("E3", base / 10.0),
        ("F3", lid / 10.0),
    ] {
        e.set(1, 0, cell, json!(n))?;
    }
    e.set(1, 0, "B3", json!("Dugnelis/dantelis 0302"))?;
    if let Some(map) = req["box"].as_object() {
        for (a, v) in map {
            if !EDITABLE.contains(&a.as_str()) {
                return Err(format!("Unsupported quotation input: {a}"));
            }
            let text = v
                .as_str()
                .ok_or_else(|| format!("Select an option for {a}."))?;
            let cell = e
                .cells
                .get(&format!("1:0:{a}"))
                .ok_or("Missing source field")?;
            let options = cell["options"].as_array().ok_or("Missing source options")?;
            if !options.iter().any(|v| v.as_str() == Some(text)) {
                return Err(format!(
                    "The selected option for {a} is not in the source catalogue."
                ));
            }
            e.set(1, 0, a, json!(text))?;
        }
    }
    for a in ["J7", "J9"] {
        if !active(&e.get(1, 0, a).text()) {
            return Err("Select greyboard for both the base and lid.".into());
        }
    }
    let automatic_fit = e.get(1, 0, "F25").text() == "Automatic";
    let semi_fit = e.get(1, 0, "F30").text() == "Automatic";
    let mut warnings: Vec<String> = vec![];
    for (cell, part) in [("C7", "base"), ("C8", "lid")] {
        if !active(&e.get(1, 0, cell).text()) {
            warnings.push(format!(
                "No outside paper selected for the {part}; the labour model still assumes wrapping."
            ));
        }
    }
    for a in ["C4", "I3", "D22", "D23"] {
        let s = e.get(1, 0, a).text();
        if !s.is_empty() && s != "0" {
            warnings.push(s)
        }
    }
    if warnings.iter().any(|s| s.contains("netelpa")) {
        return Err("The box does not fit the available sheet. Reduce the dimensions or choose another material.".into());
    }
    let mut quantities = vec![quantity];
    if let Some(list) = req["compare_quantities"].as_array() {
        if list.len() > 8 {
            return Err("Compare at most eight additional quantities.".into());
        }
        for v in list {
            let q = v.as_f64().ok_or("Comparison quantities must be numeric.")?;
            if !q.is_finite() || q < 1.0 || q > 1_000_000.0 || q.fract() != 0.0 {
                return Err(
                    "Comparison quantities must be positive whole numbers up to 1,000,000.".into(),
                );
            }
            if !quantities.contains(&q) {
                quantities.push(q)
            }
        }
    }
    let mut rows = vec![];
    for qty in quantities {
        let mode = match requested_mode {
            "auto" => {
                if qty >= 2000.0 && automatic_fit {
                    "automatic"
                } else if semi_fit {
                    "semi"
                } else {
                    "manual"
                }
            }
            other => other,
        };
        if mode == "automatic" && !automatic_fit {
            return Err(
                "This size exceeds the automatic wrapper limits. Use Auto or Manual production."
                    .into(),
            );
        }
        if mode == "semi" && !semi_fit {
            return Err("This size exceeds the semi-automatic wrapper limits. Use Auto or Manual production.".into());
        }
        let sheet = match mode {
            "automatic" => 0,
            "semi" => 1,
            _ => 2,
        };
        e.set(1, 0, "C45", json!(qty))?;
        let material_total = amount(e.get(1, 0, "C658"), "Material / external-process cost")?;
        let shipping_total = if include_shipping {
            amount(e.get(1, 0, "C61"), "Packaging / freight")?
        } else {
            0.0
        };
        let inside_lid = active(&e.get(1, 0, "D8").text());
        let inside_base = active(&e.get(1, 0, "D7").text());
        let out_lam = e.get(1, 0, "C26").text();
        let in_lam = e.get(1, 0, "D26").text();
        let foil_out = active(&e.get(1, 0, "C27").text());
        let foil_in = active(&e.get(1, 0, "D27").text());
        let relief_out = usize::from(active(&e.get(1, 0, "C31").text()))
            + usize::from(active(&e.get(1, 0, "C32").text()));
        let relief_in = usize::from(active(&e.get(1, 0, "D31").text()))
            + usize::from(active(&e.get(1, 0, "D32").text()));
        let (inside, lam, foils, reliefs, end) = match sheet {
            0 => ([19, 20], [21, 22], 23, 28, 40),
            1 => ([23, 24], [25, 26], 28, 33, 45),
            _ => ([23, 24], [25, 26], 27, 32, 43),
        };
        let mut selected = vec![
            (inside[0], inside_lid),
            (inside[1], inside_base),
            (lam[0], active(&out_lam)),
            (lam[1], active(&in_lam)),
        ];
        for i in 0..5 {
            selected.push((
                foils + i,
                match i {
                    0 => foil_out,
                    1 => foil_in,
                    _ => false,
                },
            ))
        }
        selected.push((reliefs, relief_out > 0));
        selected.push((reliefs + 1, relief_in > 0));
        if sheet == 1 {
            selected.push((
                27,
                out_lam.contains("soft touch") || in_lam.contains("soft touch"),
            ))
        }
        for (r, on) in selected {
            e.set(
                0,
                sheet,
                &format!("E{r}"),
                json!(if on { "taip" } else { "ne" }),
            )?;
        }
        e.set(0, sheet, "C3", json!(qty))?;
        e.set(0, sheet, "I3", json!(rate))?;
        let mut hours = 0.0;
        let mut processes = vec![];
        for r in 10..=end {
            let name = e
                .cells
                .get(&format!("0:{sheet}:B{r}"))
                .and_then(|c| c["text"].as_str())
                .unwrap_or("")
                .to_owned();
            if name.is_empty() {
                continue;
            }
            // Die cutting replaces V-groove milling; multiple relief passes include setup per pass.
            if (r == 12 || r == 13) && active(&e.get(1, 0, "C22").text()) {
                continue;
            }
            let multiplier = if r == reliefs {
                relief_out.max(1)
            } else if r == reliefs + 1 {
                relief_in.max(1)
            } else {
                1
            };
            let time =
                amount(e.get(0, sheet, &format!("J{r}")), "Labour process")? * multiplier as f64;
            if time > 0.0 {
                hours += time;
                processes.push(json!({"name":name.trim(),"hours":time,"cost":cents(time*rate),"passes":multiplier,"source_cell":format!("{}!J{r}",e.source[0]["sheets"][sheet]["name"].as_str().unwrap())}));
            }
        }
        let labour_total = cents(hours * rate);
        e.set(1, 0, "C53", json!(labour_total / qty))?;
        // The old selling price already contained a throughput allowance. Replace it;
        // never add labour on top of that old selling price or finishing labour tariffs.
        let cost_total = cents(material_total + labour_total + shipping_total);
        let price_per_unit = (((cost_total / qty / (1.0 - margin)) * 100.0 - 1e-9).ceil()) / 100.0;
        let selling_total = cents(price_per_unit * qty);
        let profit_total = cents(selling_total - cost_total);
        rows.push(json!({"quantity":qty as u64,"production":mode,"material_total":cents(material_total),"labour_total":labour_total,"shipping_total":cents(shipping_total),"cost_total":cost_total,"cost_per_unit":cost_total/qty,"labour_per_unit":labour_total/qty,"price_per_unit":price_per_unit,"selling_total":selling_total,"profit_total":profit_total,"actual_margin_percent":if selling_total>0.0{profit_total/selling_total*100.0}else{0.0},"hours":hours,"processes":processes,"labour_source":e.source[0]["sheets"][sheet]["name"],"source_material_cell":"Box!C658","source_labour_input":"Box!C53"}));
    }
    warnings.sort();
    warnings.dedup();
    Ok(
        json!({"schema":"ring29-box-quote/1","rows":rows,"warnings":warnings,"automatic_fit":automatic_fit,"semi_fit":semi_fit,"pricing_rule":"(variable cost + production labour + optional delivery) / (1 - gross margin)","source_version":"09-02-2026 labour / 22-04-2026 materials","dimensions_mm":{"length":length,"width":width,"base_height":base,"lid_height":lid}}),
    )
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn linked_labour_enters_quote_once() {
        let r = quote(&json!({})).unwrap();
        let r = &r["rows"][0];
        let m = r["material_total"].as_f64().unwrap();
        let l = r["labour_total"].as_f64().unwrap();
        assert!(l > 0.0);
        assert_eq!(r["cost_total"], json!(cents(m + l)));
        assert!(r["actual_margin_percent"].as_f64().unwrap() >= 25.0);
    }
    #[test]
    fn hourly_rate_changes_selling_price() {
        let a = quote(&json!({"hourly_rate":22})).unwrap();
        let b = quote(&json!({"hourly_rate":44})).unwrap();
        assert!(
            b["rows"][0]["price_per_unit"].as_f64().unwrap()
                > a["rows"][0]["price_per_unit"].as_f64().unwrap()
        );
        assert_eq!(
            a["rows"][0]["material_total"],
            b["rows"][0]["material_total"]
        );
    }
    #[test]
    fn routing_follows_quantity_and_fit() {
        let r = quote(&json!({"compare_quantities":[500]})).unwrap();
        assert_eq!(r["rows"][0]["production"], "automatic");
        assert_eq!(r["rows"][1]["production"], "manual");
    }
    #[test]
    fn invalid_inputs_have_no_quote() {
        for r in [
            json!({"quantity":0}),
            json!({"quantity":1.5}),
            json!({"margin_percent":100}),
            json!({"length_mm":"oops"}),
            json!({"box":{"C53":5}}),
        ] {
            assert!(quote(&r).is_err(), "{r}");
        }
    }
    #[test]
    fn finishing_changes_labour() {
        let a = quote(&json!({})).unwrap();
        let b = quote(&json!({"box":{"C27":"< 100cm2"}})).unwrap();
        assert!(
            b["rows"][0]["labour_total"].as_f64().unwrap()
                > a["rows"][0]["labour_total"].as_f64().unwrap()
        );
    }
}
