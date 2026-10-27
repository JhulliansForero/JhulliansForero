import sys
p=open('page.html').read(); d=open('data.json').read().replace('</','<\\/')
open('pamplona-map.html','w').write(p.replace('/*DATA*/', d, 1))
open('test.html','w').write('<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0}[hidden]{display:none!important}</style></head><body>'+open('pamplona-map.html').read()+'</body></html>')
print(len(open('pamplona-map.html').read()))
