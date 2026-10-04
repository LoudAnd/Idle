exec(open('norm.py').read().split("seqs=")[0])
seqs=['A000079','A000027','A000290','A000005','A000045','A000142','A000110','A000041','A000040','A000010','A000108','A000203','A000032','A000129','A000244']
I=list(range(1,41))+[50,60,80,100]
print('seq N w | log2 mult at i=',I)
res={}
for a in seqs:
    t=terms(a); N=len(t)
    if N<21: continue
    area=sum(math.log2(max(1,t[i])) for i in range(21))
    w=210/area
    row=[round(w*math.log2(max(1,t[min(i,N-1)])),1) for i in I]
    res[a]=row
    print(a,N,round(w,3),row)
best=[max(res,key=lambda a:res[a][j]) for j in range(len(I))]
print('best',list(zip(I,best)))
