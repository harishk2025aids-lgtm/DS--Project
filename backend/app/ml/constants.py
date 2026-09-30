"""
Constants shared between training and inference. Kept dependency-free
(no mlflow/tensorflow imports) so the lightweight predictor.py module
can run in environments where the heavier training stack isn't
installed yet (e.g. before models have been trained).
"""

WINDOW = 12          # look-back steps used by the LSTM (e.g. 12 x 4min readings)
HORIZON_STEPS = 5    # default forecast horizon in steps
