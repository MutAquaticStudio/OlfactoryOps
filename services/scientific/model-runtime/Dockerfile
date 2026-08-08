FROM python:3.11-slim

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    KERAS_BACKEND=tensorflow \
    TF_CPP_MIN_LOG_LEVEL=2

RUN apt-get update \
    && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

# The two upstream repositories are never imported by application code. This
# image exists solely for a pinned, reproducible compatibility smoke test.
RUN pip install \
    tensorflow==2.15.1 \
    keras-core==0.1.7 \
    numpy==1.26.4 \
    pandas==2.2.3 \
    scikit-learn==1.3.2 \
    scipy==1.11.4 \
    networkx==3.2.1 \
    h5py==3.10.0 \
    rdkit==2023.9.3

COPY apply_kgcnn_compat.py /tmp/apply_kgcnn_compat.py

RUN git clone --depth 1 https://github.com/osmoai/kgcnn-keras-unlocked.git /opt/kgcnn \
    && git -C /opt/kgcnn fetch --depth 1 origin 24d8b61214405f855d8a893469dfc59c0ea6c075 \
    && git -C /opt/kgcnn checkout 24d8b61214405f855d8a893469dfc59c0ea6c075 \
    && python /tmp/apply_kgcnn_compat.py /opt/kgcnn \
    && pip install --no-deps /opt/kgcnn \
    && git clone --depth 1 https://github.com/osmoai/transformer-CNN.git /opt/transformer-cnn \
    && git -C /opt/transformer-cnn fetch --depth 1 origin 4db725b5e549af7697215d8cc7a6e8a2a952dca5 \
    && git -C /opt/transformer-cnn checkout 4db725b5e549af7697215d8cc7a6e8a2a952dca5

COPY test_model_runtime.py /opt/test_model_runtime.py
CMD ["python", "/opt/test_model_runtime.py"]
