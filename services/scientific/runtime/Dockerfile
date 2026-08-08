# Native scientific dependencies are isolated from React, NestJS, and Workers.
FROM mambaorg/micromamba:2.0.8-ubuntu22.04

USER root
# The pinned BCFP source includes ``xxhash.h`` from the system development
# package in this Linux build.  Keep it explicit and documented instead of
# copying a header or substituting an unrelated hash implementation.
RUN apt-get update && apt-get install --yes --no-install-recommends build-essential git cmake ninja-build libxxhash-dev && rm -rf /var/lib/apt/lists/*
# BCFP and MolFTP both compile a C++ extension against RDKit.  The conda
# ``rdkit`` package is runtime-only; these development packages provide the
# RDKit and Boost headers required by their pinned upstream build recipes.
RUN micromamba install --yes --name base --channel conda-forge python=3.12 rdkit=2026.03 librdkit-dev=2026.03 libboost-devel cxx-compiler cmake>=3.28 xxhash numpy=1.26 pandas scikit-learn pybind11 scikit-build && micromamba clean --all --yes

ENV CONDA_PREFIX=/opt/conda
ENV RDKIT_PREFIX=/opt/conda
ENV PATH=/opt/conda/bin:${PATH}
# Osmordred's pinned CMake file searches for Eigen/Dense directly.  Conda
# installs Eigen under include/eigen3, so expose that documented include root
# without copying vendored headers into the adapter image.
ENV CMAKE_INCLUDE_PATH=/opt/conda/include/eigen3

RUN git clone https://github.com/osmoai/bcfp.git /opt/osmo/bcfp && git -C /opt/osmo/bcfp checkout 4753262e2ae6eb231be318c40623c8ab166d8ec5
RUN pip install --no-build-isolation --no-deps /opt/osmo/bcfp
RUN git clone https://github.com/osmoai/molftp.git /opt/osmo/molftp && git -C /opt/osmo/molftp checkout 98ffcb67ccfae9a0407f85f20cc76da49c784568
RUN pip install --no-build-isolation --no-deps /opt/osmo/molftp
# Osmordred is deliberately built in Dockerfile.osmordred with its pinned
# RDKit 2023.09.3/C++17 ABI.  It must never be co-installed with the BCFP and
# MolFTP RDKit 2026 runtime in this process.

WORKDIR /app
COPY scientific_runtime ./scientific_runtime
COPY tests ./tests
COPY component-pins.json ./component-pins.json
ENV PYTHONPATH=/app
ENV SCIENTIFIC_REQUIRE_NATIVE=1
EXPOSE 8099
CMD ["python", "-m", "scientific_runtime.server"]
