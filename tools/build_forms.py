import json
import re
from pathlib import Path

root=Path(__file__).resolve().parents[1]
books=json.loads((root/'evidence/workbooks.json').read_text())
screens=[]
for w,book in enumerate(books):
    for s,sh in enumerate(book['sheets']):
        cells={c['cell']:c for c in sh['cells']}
        screen={'id':f'{w}:{s}','workbook':w,'sheet':s,'name':sh['name'],'fields':[],'outputs':[],'cells':sh['cells']}
        def field(a,label,group):
            c=cells.get(a,{})
            if c.get('formula'):return
            screen['fields'].append({'id':a,'label':label,'group':group,'numeric':c.get('value') is not None or a in ('J16','J18','K18','C43','G43') or re.match(r'[C-K](53|58|66)$',a) is not None,'value':c.get('value') if c.get('value') is not None else c.get('text',''),'options':c.get('options',[])})
        def output(a,label):screen['outputs'].append({'id':a,'label':label})
        if w==0:
            screen['title']=['Automatic production','Semi-automatic production','Manual production'][s]
            for a,l in [('C3','Quantity · units'),('I3','Cost per labour hour · €'),('D2','Profit per labour hour · €')]:field(a,l,'Job')
            for a,l in [('C4','Labour cost / unit · €'),('C5','Labour + profit / unit · €'),('F2','Bottleneck capacity · units/hour'),('H2','Bottleneck hours')]:output(a,l)
            for c in sh['cells']:
                if re.match(r'B\d+$',c['cell']) and 'F'+c['cell'][1:] in cells and int(c['cell'][1:])>=10:
                    r=c['cell'][1:];label=c['text'].strip()
                    if 'E'+r in cells:field('E'+r,label+' · selected / factor','Processes')
                    field('F'+r,label+' · units/hour','Process speeds')
                    if 'I'+r in cells:field('I'+r,label+' · setup minutes','Setup')
            total=[c for c in sh['cells'] if c['cell'].startswith('J') and 'SUM([.J10:' in (c['formula']or'')]
            if total:output(total[0]['cell'],'Total labour hours')
        elif s<2:
            screen['title']='Box quotation' if s==0 else 'Insert quotation'
            for a,l in [('B3','Construction'),('C3','Length · cm'),('D3','Width · cm'),('E3','Base height · cm'),('F3','Lid height · cm'),('G3','Shoulder height · cm'),('H3','Full-depth wrapping')]:field(a,l,'Dimensions')
            for c in sh['cells']:
                a=c['cell']; r=int(re.search(r'\d+',a)[0]); col=re.match(r'[A-Z]+',a)[0]
                if r>43 or c['formula'] or not c['options'] or a in [f['id']for f in screen['fields']]:continue
                if col in ['C','D']:
                    label=cells.get('B'+str(r),{}).get('text',a)
                    if col=='D':label+=' · inside'
                    elif r in list(range(6,19))+list(range(25,34)):label+=' · outside'
                elif col in ['J','K','L']:label=cells.get('H'+str(r),{}).get('text',a)+(' · option' if col=='K' else '')
                else:label={'F7':'Printer','F43':'Delivery country','I37':'Shipping carton'}.get(a,a)
                group='Materials' if r<=18 else 'Finishing' if r<=33 else 'Foam & transport'
                field(a,label,group)
            for a,l in [('J16','Insert die cost · €'),('J18','Insert length · cm'),('K18','Insert width · cm'),('C43','Foam die cost · €'),('G43','Additional freight · €')]:field(a,l,'Manual costs')
            for col in 'CDEFGHIJK':
                field(col+'45',f'Batch {col} · quantity','Batch quantities')
                field(col+'53',f'Batch {col} · labour cost / unit €','Labour inputs')
                field(col+'660',f'Batch {col} · throughput target / unit €','Pricing targets')
                field(col+'57',f'Batch {col} · material margin (0–1)','Pricing targets')
                field(col+'66',f'Batch {col} · manual freight €','Manual costs')
                for row,label in [(46,'Source price / unit'),(47,'Source price total'),(52,'Labour + material / unit'),(54,'Material price / unit'),(61,'Freight'),(63,'Pallets')]:output(f'{col}{row}',f'{col} · {label}')
            for a,l in [('C4','Sheet fit'),('I3','Wrapping warning'),('D22','Milling warning · base'),('D23','Milling warning · lid'),('F25','Automatic machine fit'),('F30','Semi-automatic machine fit'),('M5','Base board length · mm'),('P5','Base board width · mm'),('M10','Lid board length · mm'),('P10','Lid board width · mm')]:output(a,l)
        else:
            screen['title']='Foam calculator'
            for c in sh['cells']:
                if c['value'] is not None and not c['formula']:
                    row=re.search(r'\d+',c['cell'])[0];labels=[d['text']for d in sh['cells'] if re.search(r'\d+',d['cell'])[0]==row and d['value'] is None and not d['formula']]
                    field(c['cell'],' · '.join(labels[:2])or c['cell'],'Foam inputs')
                elif c['formula']:output(c['cell'],c['cell'])
        screens.append(screen)
(root/'evidence/forms.json').write_text(json.dumps(screens,ensure_ascii=False,indent=2))
print('Generated',len(screens),'native forms')
