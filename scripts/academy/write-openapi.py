#!/usr/bin/env python3
"""Print the exact academy operation surface for a reviewed APIM import."""
import json
paths={}
for method,path,name in [('get','/catalog','Catalog'),('get','/me','MyProgress'),('post','/attempts','GradeQuiz'),('post','/events','RecordActivity'),('put','/preferences','Preferences'),('get','/sources/{courseId}/{index}','ReviewedSource'),('get','/plans','ReadPlans'),('put','/plans','SavePlan'),('delete','/plans/{id}','DeletePlan'),('get','/analytics','TeamInsights')]:
 op={'operationId':name,'summary':name,'security':[{'CravesBearer':[]}],'responses':{'200':{'description':'Authorized response'},'401':{'description':'Session required'},'403':{'description':'Role required'}}}
 params=[]
 for key in ('courseId','index','id'):
  if '{'+key+'}' in path: params.append({'name':key,'in':'path','required':True,'schema':{'type':'string'}})
 if name in ('TeamInsights','DeletePlan'): params.append({'name':'page' if name=='TeamInsights' else 'revision','in':'query','required':name=='DeletePlan','schema':{'type':'integer','minimum':0 if name=='TeamInsights' else 1}})
 if params: op['parameters']=params
 if method in ('post','put'): op['requestBody']={'required':True,'content':{'application/json':{'schema':{'type':'object'}}}}
 paths.setdefault(path,{})[method]=op
print(json.dumps({'openapi':'3.0.3','info':{'title':'Craves Internal Academy','version':'1.0.0'},'paths':paths,'components':{'securitySchemes':{'CravesBearer':{'type':'http','scheme':'bearer','bearerFormat':'Craves JWT'}}}},indent=2))
