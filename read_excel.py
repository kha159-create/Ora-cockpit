
import pandas as pd
import sys

try:
    df = pd.read_excel('C:/Users/Orange1/Downloads/mapping.xlsx', nrows=5)
    print("Columns:", df.columns.tolist())
    print("Sample Data:")
    print(df.head())
except Exception as e:
    print(e)
