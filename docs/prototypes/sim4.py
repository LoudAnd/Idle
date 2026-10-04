exec(open('sim2.py').read().split("c0=[1,2")[0])
c0=[1,2,4,7,11,16,22,29]
rho=[(k+2)/10 for k in range(1,9)]
for pm in [1, 3, 10, 30, 100]:
  print(pm, run(c0,rho,gm_base=1.15,gm_cost0=2,gm_step=1.0,rate=2,target=40 if pm==1 else 100,dt=0.5,tmax=7200,pmult=pm))
