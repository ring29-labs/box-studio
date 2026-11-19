import json
import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
NS = {k: f'urn:oasis:names:tc:opendocument:xmlns:{v}:1.0' for k, v in [('o','office'),('t','table'),('x','text'),('s','script')]}
NS['style']='urn:oasis:names:tc:opendocument:xmlns:style:1.0'
NS['n']='urn:oasis:names:tc:opendocument:xmlns:datastyle:1.0'
SOURCES = ['0302 Labour cost - 09-02-2026.ots', 'New Box formula 22-04-2026.ots']

def colname(n):
    s = ''
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65+r) + s
    return s

reports = []
def odf_text(el):
    if el.tag == '{'+NS['x']+'}s': return ' '*int(el.get('{'+NS['x']+'}c','1'))
    if el.tag == '{'+NS['x']+'}tab': return '\t'
    if el.tag == '{'+NS['x']+'}line-break': return '\n'
    return (el.text or '')+''.join(odf_text(ch)+(ch.tail or '') for ch in el)

for filename in SOURCES:
    with zipfile.ZipFile(Path.home()/'Downloads'/filename) as z:
        root = ET.fromstring(z.read('content.xml'))
        style_roots=[ET.fromstring(z.read('styles.xml')),root]
        styles={el.get('{'+NS['style']+'}name'):el for rt in style_roots for el in rt.findall('.//style:style',NS)}
        formats={}
        for rt in style_roots:
            for el in rt.iter():
                if el.tag.startswith('{'+NS['n']+'}') and el.tag.endswith('-style'):
                    number=el.find('n:number',NS)
                    if number is not None:
                        decimals=number.get('{'+NS['n']+'}decimal-places')
                        if decimals is not None: formats[el.get('{'+NS['style']+'}name')]=int(decimals)+(2 if el.tag.endswith('percentage-style') else 0)
        def precision(style,seen=None):
            seen=seen or set()
            if not style or style in seen or style not in styles:return None
            seen.add(style); el=styles[style]
            data_style=el.get('{'+NS['style']+'}data-style-name')
            if data_style:return formats.get(data_style)
            return precision(el.get('{'+NS['style']+'}parent-style-name'),seen)
        calc=root.find('.//t:calculation-settings',NS)
        precision_as_shown=calc is not None and calc.get('{'+NS['t']+'}precision-as-shown')=='true'
        validations = {el.get('{'+NS['t']+'}name'): re.findall(r'"([^"]*)"',el.get('{'+NS['t']+'}condition','')) for el in root.findall('.//t:content-validation',NS)}
        report = {'filename': filename, 'macro_parts': [n for n in z.namelist() if re.search(r'(^Basic/|^Scripts/|vba|\.bin$|script-lb)', n, re.I)], 'events': [], 'sheets': []}
        for el in root.iter():
            if 'event-listener' in el.tag or el.tag.endswith('}script'):
                report['events'].append({'tag':el.tag, 'attributes':el.attrib})
        for table in root.findall('.//t:table', NS):
            sheet = {'name': table.get('{'+NS['t']+'}name'), 'cells': []}
            rownum = 1
            for row in table.findall('.//t:table-row', NS):
                rowrepeat = int(row.get('{'+NS['t']+'}number-rows-repeated', '1'))
                colnum = 1
                for cell in row:
                    if cell.tag not in ['{'+NS['t']+'}table-cell','{'+NS['t']+'}covered-table-cell']: continue
                    repeat = int(cell.get('{'+NS['t']+'}number-columns-repeated', '1'))
                    text = '\n'.join(odf_text(p) for p in cell.findall('x:p', NS))
                    formula = cell.get('{'+NS['t']+'}formula')
                    value = cell.get('{'+NS['o']+'}value')
                    validation=cell.get('{'+NS['t']+'}content-validation-name')
                    if text or formula or value is not None or validation:
                        if repeat*rowrepeat > 100000: raise ValueError('Oversized populated repeat')
                        for rr in range(rowrepeat):
                            for cc in range(repeat):
                                style=cell.get('{'+NS['t']+'}style-name')
                                sheet['cells'].append({'cell':f'{colname(colnum+cc)}{rownum+rr}','text':text,'value':value,'formula':formula,'style':style,'options':validations.get(validation,[]),'precision':(precision(style) if precision(style) is not None else 2) if precision_as_shown else None})
                    colnum += repeat
                rownum += rowrepeat
            report['sheets'].append(sheet)
        reports.append(report)
        stem = 'labour' if filename.startswith('0302') else 'box'
        (ROOT/'evidence'/f'{stem}-content.xml').write_bytes(z.read('content.xml'))
        (ROOT/'evidence'/f'{stem}-thumbnail.png').write_bytes(z.read('Thumbnails/thumbnail.png'))
(ROOT/'evidence'/'workbooks.json').write_text(json.dumps(reports, indent=2))
for report in reports:
    print(report['filename'], 'macros:',report['macro_parts'], 'events:',report['events'])
    for sheet in report['sheets']:
        print('SHEET',sheet['name'],'populated:',len(sheet['cells']),'formulas:',sum(bool(c['formula']) for c in sheet['cells']))
        if len(sheet['cells']) < 800:
            for c in sheet['cells']:
                print(c['cell'], c['formula'] or c['text'] or c['value'])
