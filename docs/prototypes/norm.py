import subprocess, math, os
SHA = '2571637880e813b773a668e6faabc1569e026bb2'  # pinned oeisdata commit
def terms(a):
    f=subprocess.run(['git','-C',os.environ.get('ASSET_SRC_OEIS','/home/user/oeis/oeisdata'),'show',f'{SHA}:seq/{a[:4]}/{a}.seq'],capture_output=True,text=True).stdout
    t=''.join(l.split(' ',2)[2] for l in f.splitlines() if l[:2] in('%S','%T','%U'))
    return [int(v) for v in t.split(',') if v.strip()]
seqs=['A000079','A000027','A000290','A000005','A000045','A000142','A000110','A000041','A000040','A000010','A000108']
I=[3,5,8,12,16,20,22,24,26,30,34,40,50,60,76,100]
print('seq N w | log2 mult at i=',I)
res={}
for a in seqs:
    t=terms(a); N=len(t)
    w=20*math.log(2)/math.log(1+t[20])
    row=[]
    for i in I:
        v=t[min(i,N-1)]
        row.append(round(w*math.log2(1+v),1))
    res[a]=row
    print(a,N,round(w,3),row)
best=[max(res,key=lambda a:res[a][j]) for j in range(len(I))]
print('best',list(zip(I,best)))
