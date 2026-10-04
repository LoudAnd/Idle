"""Offline macro-step schedule (GDD 20.2).

N = min(2000, ceil(D / h0)) steps. If N * h0 >= D the steps are equal (D / N).
Otherwise step i is min(h0 * 1.01**i, h_max), with h_max solved by bisection so
the steps sum to D (the last step absorbs the rounding residual).
Run: python3 macro_steps.py
"""
import math


def schedule(D, h0=0.05, g=1.01, nmax=2000):
    n = min(nmax, math.ceil(D / h0 - 1e-9))
    if n * h0 >= D - 1e-12:
        return n, D / n, 0

    def total(hm):
        return sum(min(h0 * g ** i, hm) for i in range(n))

    lo, hi = h0, D
    for _ in range(100):
        mid = (lo + hi) / 2
        if total(mid) < D:
            lo = mid
        else:
            hi = mid
    hm = (lo + hi) / 2
    ramp = sum(1 for i in range(n) if h0 * g ** i < hm)
    return n, hm, ramp


if __name__ == '__main__':
    for D in [10, 100, 3600, 8 * 3600, 24 * 3600, 72 * 3600, 7 * 86400]:
        n, hm, ramp = schedule(D)
        print(f"{D:>7} s: {n} steps, max step {hm:.2f} s, ramp steps {ramp}")
