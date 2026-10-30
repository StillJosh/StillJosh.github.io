---
layout: post
title: "OperatorSHAP: Shapley values for neural operators"
description: "Fast and accurate Shapley value estimation for neural operators."
paper: operatorshap
---

I've noticed lately that I often trust our AI companions more than I trust my own ability to spot their mistakes. With every new generation of LLMs, I'm becoming less inclined to double-check their results. Still, I believe human oversight will remain important in certain domains of AI. One example is insurance premiums, which must not be influenced by racial biases hidden in names or residential areas. Another is predictions in low-data regimes, where models are less reliable, and human experts could avert problematic decisions.

The latter setting often arises in my field of research, neural operators: models that predict physical quantities in science and engineering. In this field, training samples are usually costly to obtain, but the ground truth is well understood from a theoretical perspective. This enables professionals to judge the quality of model predictions.

## Explaining models with Shapley values
These judgements could be complemented by feature attributions, such as *Shapley values*. Shapley values attribute a model's prediction to the input features. They satisfy a set of desirable properties and are widely established in the scientific community. However, they are usually too costly to compute and even approximation methods can be slow when the number of features is large.

When we want to explain multiple samples, amortization methods can shift the computational load from inference to training. One such method, FastSHAP ([Jethani et al., 2022](https://arxiv.org/abs/2107.07436)), trains a neural network to predict Shapley values, resulting in quick attributions for any new sample. Unfortunately, FastSHAP requires homogeneous inputs with the same set of features across the training set, and physical data usually lives on a continuous domain that is discretized on meshes that may differ from input to input.

<figure class="viz" id="viz-meshes">
<figcaption>Four samples of a flow around an obstacle in the channel $\Omega = [0,2]\times[0,1]$. The obstacle has a different position and size in each sample. The mesh generator places nodes on the obstacle boundary and refines the mesh around it, so every sample has a distinct mesh. All samples share the domain $\Omega$. Colors show an illustrative flow speed.</figcaption>
</figure>

For amortization to work, we need a shared property that we can generalize over. In this paper, we choose the underlying physical domain $$\Omega \subset \mathbb{R}^d$$, which is a connected subset of the $$1$$-, $$2$$-, or $$3$$-dimensional space and is often shared by all samples of a dataset. The main obstacle is that Shapley values are defined only for finitely many players, whereas our region $$\Omega$$ consists of infinitely many points.

## Infinite-player Aumann-Shapley values
The solution lies in Aumann-Shapley values. Introduced in 1974 ([Aumann & Shapley, 1974](#references)), they generalize Shapley values to infinitely many players. They still cannot give distinct attributions for every single point in our domain, but they allow each of the infinite players to contribute via a finite set of measures to the model prediction (which we call a *game*). This makes the attribution problem tractable. Moreover, for a game $$\nu(S)$$, which assigns a payoff to each coalition $$S$$, they yield a value $$\varphi$$ that distributes this payoff over the players while preserving some of the Shapley properties.

To formalize this, let $$(\Omega, \mathcal{C}, \boldsymbol{\mu})$$ be a measure space, where $$S \in \mathcal{C}$$ denotes a region in $$\Omega$$ and defines a *coalition*. Typically, we want to model some physical property, which at a time $$t$$ assigns a value to each location $$x\in \Omega$$ via $$u: \Omega\times[0, \infty)\rightarrow \mathbb{R}$$. For example, in the heat equation, $$u(x, t)$$ is the temperature at location $$x\in \Omega$$ and time $$t$$. We want an AI model $$\hat{\mathcal{F}}$$ to approximate $$u(x,t)$$, usually using the true state $$u(x,t)$$ as input to predict $$\hat{\mathcal{F}}(u(x,t))(x) \approx u(x,t+1)$$. In practice, we work with a discretized version of $$u(x,t)$$, i.e., a vector of evaluations of $$u(x,t)$$ at specific locations. We denote this vector by $$\mathbf{u}_{t}$$.

<figure class="viz" id="viz-heat">
<figcaption>The heat equation $\partial_t u = \nu\, \partial_{xx} u$ on $\Omega = [0,1]$ with $u = 0$ at both ends. Left: the state $u(x,t)$, the model input $u(x,t-1)$ and the model prediction $\hat{\mathcal{F}}(u(x,t-1)) \approx u(x,t)$. Right: the same on a mesh of 26 nodes, i.e., the vectors $\mathbf{u}_{t-1}$, $\mathbf{u}_t$ and the prediction at the nodes. Each new sample draws a random initial temperature.</figcaption>
</figure>

Now, we will explain the model's predictions. In our Aumann-Shapley case, this means we will identify areas in $$\Omega$$ that contributed positively or negatively to the prediction (relative to a baseline value). Concretely, we pick a location $$\hat{x}\in \Omega$$, look at the prediction at that point $$\hat{\mathcal{F}}_{\hat{x}}(u(x,t)) := \hat{\mathcal{F}}(u(x,t))(\hat{x})$$ compared to a baseline $$\hat{\mathcal{F}}_{\hat{x}}(\bar{u}(x,t))$$ (e.g., $$\bar{u}(x,t)\equiv 0$$) and attribute that difference to the input areas. For the heat equation, we would then end up with an attribution plot like the following.

<figure class="viz" id="viz-attr">
<figcaption>Left: an input $u$, the baseline $\bar{u} \equiv 0$ and the predictions $\hat{\mathcal{F}}(u)$ and $\hat{\mathcal{F}}(\bar{u})$ of the model from above. The vertical line at $\hat{x}$ is the difference $\Delta = \hat{\mathcal{F}}_{\hat{x}}(u) - \hat{\mathcal{F}}_{\hat{x}}(\bar{u})$ that the attribution explains. Right: the attribution $\varphi(x)$ of the prediction at $\hat{x}$. Red areas raise the prediction, blue areas lower it. Its integral over $\Omega$ equals $\Delta$. We can see that only the points close to $\hat{x}$ influence the prediction at $\hat{x}$, which is typical for the heat equation.</figcaption>
</figure>

To show that our attributions are actually meaningful (i.e., that they satisfy similar properties to those of Shapley values), we build on Aumann-Shapley theory. They show that if our game has the form $$\nu(S)=f(\mu_{1}(S), \dots, \mu_{n}(S))$$, where $$f$$ is continuously differentiable, $$f(0)=0$$, and $$\mu_{i}$$ are measures, then there exists a value with the desired properties. Hence, our task is to create such a game for neural operators. Then, we know that a value for the game exists and can proceed to learn it from data.

To design our game, we need the following:
1. The game should represent how a prediction changes depending on the input.
2. We should be able to specify any region $$S\subset \Omega$$ and determine how it affects the output.
3. It needs to satisfy the Aumann-Shapley criteria, in particular, $$f$$ must be continuously differentiable.

We choose $$f$$ to be the neural operator that we want to explain (minus a baseline constant). For $$f$$ to be continuously differentiable, both its activations and its input need to be sufficiently smooth.[^diff] To isolate the effect of an area $$S$$, we will design the input to take the value $$u(x,t)$$ on $$S$$ and a baseline value $$\bar{u}(x,t)$$ elsewhere. As this constructed input needs to be smooth as well, we interpolate smoothly between $$S$$ and $$\Omega\setminus S$$, using bump functions $$\eta_{i}$$ that partition the domain $$\Omega$$. Concretely, for $$m>0$$, we define our game as

$$
\begin{aligned}
\nu(S) &= \hat{\mathcal{F}}_{\hat{x}}(\mathbf{u}^{S}_{t}) - \hat{\mathcal{F}}_{\hat{x}}(\bar{\mathbf{u}}_{t}), \\
\mathbf{u}^{S}_{t} &:= \bar{\mathbf{u}}_{t} + \sum_{i=1}^{m} \mu_{i}(S)\, \eta_{i}\, (\mathbf{u}_{t} - \bar{\mathbf{u}}_{t}),
\end{aligned}
$$

where $$\mu_{i}(S)$$ is the share of the mesh nodes under $$\eta_{i}$$ that belong to $$S$$. The following visualization constructs a game from start to finish.

<figure class="viz" id="viz-game">
<figcaption>Construction of the game for 16 mesh nodes $x_1, \dots, x_{16}$ and $m$ masks. (1) The smooth masks $\eta_i$ sum to one on $\Omega,$ and each covers the cells of consecutive nodes. (2) $\mu_i(S)$ is the share of the nodes under $\eta_i$ that belong to $S$ (filled). (3) The input $u$ and the baseline $\bar{u} \equiv 0$. (4) The game input $\bar{u} + \sum_i \mu_i(S)\,\eta_i\,(u - \bar{u})$. It equals $u$ under masks that lie fully in $S$ and $\bar{u}$ under masks outside of $S$. Click a node to add it to or remove it from $S$.</figcaption>
</figure>

## The OperatorSHAP algorithm

Equipped with a game that guarantees an Aumann-Shapley value, we can proceed to learn an amortized model for the value. The training procedure will closely follow FastSHAP:
1. Sample $$\mathbf{u}_{t}$$ from the dataset (which is represented on a mesh), a subset of the mesh nodes $$S$$, and a location $$\hat{x}\in \Omega$$ for the prediction we want to explain.
2. Partition the domain into disjoint cells, each containing one mesh node (e.g., with Voronoi cells).
3. Create a masked input $$\mathbf{u}^{S}_{t}$$ as described above and calculate the game value $$\hat{\mathcal{F}}_{\hat{x}}(\mathbf{u}^{S}_{t}) - \hat{\mathcal{F}}_{\hat{x}}(\bar{\mathbf{u}}_{t})$$ at location $$\hat{x}$$.
4. Let the explainer model predict an attribution field $$\hat{\varphi}(x,t)$$ for the point $$\hat{x}$$.
5. Integrate $$\hat{\varphi}(x,t)$$ over the cells from step 2 that contain a mesh node from $$S$$ and measure the difference to the game value from step 3.
6. Update the explainer model with the loss from step 5 and iterate.

<figure class="viz" id="viz-train">
<figcaption>Training the explainer, one iteration per step. Steps 1–2: a new input, a new random mesh of 6 to 12 nodes $x_1, \dots, x_n$ (shown on the zero line), a random coalition $S$ (filled nodes), a location $\hat{x}$, and the Voronoi cells of the nodes. Step 3: the masked input $\mathbf{u}^S_t$, the model predictions $\hat{\mathcal{F}}(\mathbf{u}^S_t)$ and $\hat{\mathcal{F}}(\bar{\mathbf{u}}_t)$, and the model value $\nu(S) = \hat{\mathcal{F}}_{\hat{x}}(\mathbf{u}^S_t) - \hat{\mathcal{F}}_{\hat{x}}(\bar{\mathbf{u}}_t)$ as the vertical line at $\hat{x}$. Steps 4–5: the explainer's attribution $\hat{\varphi}$ and its integral over the cells of $S$ (shaded), compared to the model value. The dashed line is the exact attribution from above. Step 6: the loss of the current iteration written out, and the loss over iterations. The explainer used here is small: $\hat{\varphi}(x) = u(x)\, k_\theta(x - \hat{x})$, with a kernel $k_\theta$ given by 101 values and trained with Adam. OperatorSHAP uses a neural operator as the explainer.</figcaption>
</figure>

## Conclusion

After the training, we have a model that can predict an attribution map over arbitrary input fields $$u(x,t)$$, and we can calculate values for coalitions $$S$$ by integrating the attribution field over the respective area. In the paper, we include additional engineering tricks that can improve predictive performance. Many other techniques can surely be adapted from the discrete Shapley literature to get even better results. We can also explain other quantities of the model, including, empirically, non-differentiable readouts. In a follow-up work, we extend OperatorSHAP to capture interactions between regions of the domain. We believe that many other results from the discrete Shapley literature can likewise be transferred to the functional setting of OperatorSHAP.

## References

- Aumann, R. J., & Shapley, L. S. (1974). *Values of Non-Atomic Games*. Princeton University Press.
- Jethani, N., Sudarshan, M., Covert, I., Lee, S.-I., & Ranganath, R. (2022). [FastSHAP: Real-time Shapley value estimation](https://arxiv.org/abs/2107.07436). *ICLR*.

[^diff]: We define $$f$$ in function space, as this reflects PDE theory best. There, differentiability is more involved than on finite-dimensional spaces. Details can be found in the paper.

<script src="{{ '/assets/js/viz.js' | relative_url }}" defer></script>
<script src="{{ '/assets/js/shap-figures.js' | relative_url }}" defer></script>
