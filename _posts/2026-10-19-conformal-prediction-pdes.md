---
layout: post
title: "Conformal prediction for time-dependent PDEs"
description: "Why non-exchangeable conformal prediction fails on function spaces, and when it works on discretized linear PDEs."
paper: conformal-pde
---

Conformal prediction (CP) is a neat method to get guarantees about a model's prediction. Its simplicity made it one of the hottest topics in ML in recent years. With dozens of papers in top-rated venues, it has seemingly been applied in every way possible, extending even beyond its original scope. Where, initially, it was targeted at problems where the test distribution follows the training distribution[^exch], modern variants allow applications even to datasets with distribution shifts, like time series.

[^exch]: Throughout the article, I will circumvent precise notions like exchangeability to prioritize readability over exactness.

In time series, the distribution may change arbitrarily over time and a deployed model can suddenly produce arbitrarily bad predictions, not hedgeable by anything we know from the training time. While this violates the assumptions of (classic) CP, there are multiple extensions that either relax its implications, e.g., by guaranteeing coverage only on average over an infinite time frame (see Adaptive Conformal Prediction, [Gibbs & Candès, 2021](https://proceedings.neurips.cc/paper_files/paper/2021/file/0d441de75945e5acbc865406fc9a2559-Paper.pdf)), or by increasing the prerequisites, e.g., through knowledge about the time series ([Oliveira et al., 2024](http://jmlr.org/papers/v25/23-1553.html)), the error of the model ([Auer et al., 2023](https://proceedings.neurips.cc/paper_files/paper/2023/file/aef75887979ae1287b5deb54a1e3cbda-Paper-Conference.pdf)), or the distributional change ([Barber et al., 2023](https://doi.org/10.1214/23-AOS2276)).

Personally, I do not see CP being used in life-or-death situations where minor deviations from the coverage guarantees could be critical. Therefore, due to its simplicity, I find Adaptive Conformal Prediction and its variants to be the most reasonable choice for time series applications. Nonetheless, the problem sparked our curiosity. Our field of study, partial differential equations (PDEs), which describe physical processes, is full of time series with additional structure and offers a plethora of mathematical tools to analyze their behavior.

## A Simple PDE Example

For this article, it suffices to view PDEs as a time series on a continuous domain. For example, consider functions $$u(x,t): [0,1] \times [0, \infty) \rightarrow \mathbb{R}$$ that have values at a point in time and space. Here, space is represented by the interval from $0$ to $1$ and time by the interval from $0$ to $\infty$. In practice, we rarely work with the full continuous function. Instead, functions are discretized in time and space. We will then write $$\mathbf{u}^t:=\left( u(0,t), u(\frac{1}{10},t), \dots, u(1,t) \right)$$. This dichotomy raised one of our initial questions: Are there any differences between CP on the functional and the discrete form?

We will visualize some results using the heat equation. The heat equation is one of the simplest PDEs and describes how heat spreads on an object over time. Essentially, every point gets either hotter or colder, depending on the temperature difference to its surrounding area. The visualization below shows how the time series evolves for the functional and the discrete form, depending on the initial temperature distribution.

<figure class="viz" id="viz-heat">
<figcaption>The heat equation $\partial_t u = \nu\, \partial_{xx} u$ with $u = 0$ at both ends. Left: the function $u(\cdot, t)$, with the initial temperature in grey. Right: the vector $\mathbf{u}^t$ on 11 grid points, observed only at integer times. Earlier time steps are shown faded. Each new sample draws a random initial temperature.</figcaption>
</figure>

## Conformal Prediction on PDEs

Suppose we observe the temperature of the object at some time $$t$$ and want to predict it for some future time $$t+1$$. Additionally, we would like to know how certain the model is in its prediction. This (un-)certainty is usually represented by a probability distribution over the possible predictions.

Now, in Conformal Prediction, we train our model and then estimate the error distribution on a held-out calibration set. We can use a sufficiently large quantile of the errors to construct *prediction bands*. If the test data follows the same distribution as the calibration data, we even get probabilistic guarantees that the true test value falls into the constructed bands.

Unfortunately, in time series, the data distribution may shift between calibration and test time, and with it the error distribution of our model. Thus, our guarantees vanish. Non-exchangeable CP ([Barber et al., 2023](https://doi.org/10.1214/23-AOS2276)), an extension of classical CP, prices this shift into our prediction bands. Depending on the total variation (TV) distance between calibration and test distributions, they widen the bands until they have recovered the probabilistic guarantees. However, if the TV distance gets too large, the resulting prediction bands will cover the whole prediction space and therefore become uninformative. The animation below shows the TV distance for two Gaussian distributions and how we have to adjust our prediction bands depending on their shift.

<figure class="viz" id="viz-tv">
<figcaption>Left: calibration distribution $\mathcal{N}(0,1)$ and test distribution $\mathcal{N}(\mu,1)$. The shaded area equals their TV distance. Right: a prediction with its 90% conformal band. The orange part is the widening needed to cover the test distribution, using the $(90\% + 2\,\mathrm{TV})$ quantile of the calibration errors. At 100% and above, the band is infinite.</figcaption>
</figure>

## A Function Space Perspective

In the paper, we first investigate the TV distance in a function space setting. For this, we use the heat equation and assume the initial temperature along a 1D line segment is Gaussian[^gauss]. Our theorem shows that for any evolution time $$t>0$$, no matter how small, the TV distance between the initial and the final temperature distribution is always $$1$$. This implies that even if our calibration and test time points are just an $$\varepsilon$$ apart, we cannot apply (non-exchangeable) CP on them. This is because calibration and test distributions live on an infinite-dimensional (function) space. Thus, tiny changes accumulate over the infinite dimensions to result in mutually singular distributions. While we show this only on one example with the heat equation, this is a common behavior of distributions on function spaces.

[^gauss]: In particular, we assume a Gaussian distribution on a function space, which is a bit more complicated than "normal" Gaussian distributions. For this demonstration, it suffices to imagine that we randomly pick a somewhat smooth function fluctuating around 0.

<figure class="viz" id="viz-singular">
<figcaption>The heat equation $\partial_t u = \partial_{xx} u$ with the Gaussian initial distribution from our theorem, discretized on $p$ grid points. Each grid point adds one independent Fourier mode. Left: how much the variance of each mode shrinks between time $t$ and $t+\delta$. High modes decay fastest, so their variances differ most. Right: the TV distance between the distributions at $t$ and $t+\delta$, estimated from 2000 samples. It approaches $1$ as $p$ grows, for any $\delta > 0$. The function space corresponds to $p \to \infty$.</figcaption>
</figure>

## A Vector Space Perspective

While this result undermines the success of CP on functional data, it has little effect in practice. There, we usually work with a discretized version of a function, i.e., a finite-dimensional vector. And indeed, starting with an initial temperature vector from a finite-dimensional Gaussian, the TV distance between any two time points will always be strictly smaller than $$1$$ (except in degenerate cases). Further, if we take a small enough time step, our CP prediction bands will even be bounded, providing useful guarantees.

In the paper, we provide a more general proposition. We can construct prediction bands for any linear PDE when the family of the initial distribution is closed under affine transformations (e.g., Gaussian, Cauchy, Laplace, and more). We use the algorithm from [Tibshirani et al. (2019)](https://proceedings.neurips.cc/paper_files/paper/2019/file/8fb21ee7a2207526da55a679f0332de2-Paper.pdf), which constructs the CP bands from the likelihood ratio between test and calibration densities. If the likelihood ratio of a test sample exceeds a certain threshold, prediction bands become infinitely wide and coverage is trivial. In general, this preserves the target coverage of the test samples over time, until all test samples get infinite bands. In practice, we would estimate the mean and covariance needed for the likelihood ratio from the data.

<figure class="viz" id="viz-wcp">
<figcaption>Weighted conformal prediction with calibration distribution $\mathcal{N}(0,1)$ and test distribution $\mathcal{N}(1.5,1)$. Left: 200 calibration points (ticks, height proportional to their weight) and the test point. Each point is weighted by the likelihood ratio $p_{\mathrm{test}}/p_{\mathrm{cal}}$. Right: the prediction for the test point with its weighted 90% band. The dashed lines mark the unweighted band. Once the test point's normalized weight exceeds $\alpha = 0.1$, the band is infinite.</figcaption>
</figure>

In the infinite-dimensional setting, we found that even arbitrarily small time shifts result in a TV distance of $1$. In finite dimensions, however, the TV distance is usually strictly smaller than $1$. We wanted to investigate if there is a natural connection between higher dimensionality, meaning larger grid sizes of the data, and TV distance. Indeed, it is not dimensionality itself that is driving this behavior. For a simple PDE that shifts in mean at a constant pace, we show that the drift direction relative to the covariance of the initial distribution is the deciding factor. As dimensionality implicitly affects this, we can mitigate the CP degeneration by restricting our prediction to a subset of our dimensions. To be precise, the prediction of our model can still use the full data space as input, but we need to carefully select the dimensions for which we want prediction bands (our paper shows some examples).

<figure class="viz" id="viz-drift">
<figcaption>A drift in two dimensions $(u_1, u_2)$ with correlated Gaussian initial distribution. Left: calibration (green) and test (orange) distribution. Drag the test distribution or use the sliders. Ellipses mark one and two standard deviations. Right: TV distance when we want bands for both coordinates and for $u_1$ only. A drift along the wide axis of the covariance costs little. A drift along the narrow axis costs much. Restricting to $u_1$ never increases the TV distance.</figcaption>
</figure>

## Conclusion

In conclusion, we have shown that on a function space, non-exchangeable CP will usually fail, while in discrete space, we can get robust prediction bands for linear PDEs by simply estimating the mean and covariance of the data. However, in that restricted setting, there are usually more straightforward methods to achieve accurate predictions and uncertainty bands. Our contribution should be viewed as theoretical, and we hope to inspire future work investigating different properties of PDEs and certain subclasses of PDEs that could unlock non-exchangeable CP in that setting.

## References

- Auer, A., Gauch, M., Klotz, D., & Hochreiter, S. (2023). [Conformal prediction for time series with modern Hopfield networks](https://proceedings.neurips.cc/paper_files/paper/2023/file/aef75887979ae1287b5deb54a1e3cbda-Paper-Conference.pdf). *NeurIPS*.
- Barber, R. F., Candès, E. J., Ramdas, A., & Tibshirani, R. J. (2023). [Conformal prediction beyond exchangeability](https://doi.org/10.1214/23-AOS2276). *The Annals of Statistics*, 51(2).
- Gibbs, I., & Candès, E. (2021). [Adaptive conformal inference under distribution shift](https://proceedings.neurips.cc/paper_files/paper/2021/file/0d441de75945e5acbc865406fc9a2559-Paper.pdf). *NeurIPS*.
- Oliveira, R. I., Orenstein, P., Ramos, T., & Romano, J. V. (2024). [Split conformal prediction and non-exchangeable data](http://jmlr.org/papers/v25/23-1553.html). *JMLR*, 25.
- Tibshirani, R. J., Barber, R. F., Candès, E., & Ramdas, A. (2019). [Conformal prediction under covariate shift](https://proceedings.neurips.cc/paper_files/paper/2019/file/8fb21ee7a2207526da55a679f0332de2-Paper.pdf). *NeurIPS*.

<script src="{{ '/assets/js/viz.js' | relative_url }}" defer></script>
<script src="{{ '/assets/js/cp-figures.js' | relative_url }}" defer></script>
