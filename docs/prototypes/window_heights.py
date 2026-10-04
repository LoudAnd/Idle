"""Height needed to buy a given count of one tier (GDD 6.2, 8.8, 10.1), default knobs.

Pre-cap cost of purchase n of Gk: L = lambda_k + rho_k * n (log10).
Governor: above L0 = 308.25, L' = L + a*e*(e+1)/2 with e = purchases beyond the
last one priced <= L0; above L1 = 1e4, L'' = L1 * (L'/L1)**p.
Height h = floor(log2(log2 x)) - 15 with log10 x = L''.
Run: python3 window_heights.py
"""
import math

LAM = [1, 2, 4, 7, 11, 16, 22, 29]
RHO = [(k + 2) / 10 for k in range(1, 9)]


def cost_log10(k, n, a=0.05, L0=308.25, L1=1e4, p=1.5):
    lam, rho = LAM[k - 1], RHO[k - 1]
    L = lam + rho * n
    if L <= L0:
        return L
    last_cheap = math.floor((L0 - lam) / rho)
    e = n - last_cheap
    L = L + a * e * (e + 1) / 2
    if L > L1:
        L = L1 * (L / L1) ** p
    return L


def height(log10x):
    if log10x <= 308.25:
        return 'pre-cap'
    return math.floor(math.log2(log10x * math.log2(10))) - 15


if __name__ == '__main__':
    for k, b in [(1, 17711), (1, 20000), (8, 20000), (1, 41000), (1, 75025), (8, 70)]:
        L = cost_log10(k, b - 1)
        print(f"G{k} purchase #{b}: log10 cost {L:.3e}, height {height(L)}")
