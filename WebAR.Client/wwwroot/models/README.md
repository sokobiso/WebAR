# Modèle YOLO11n
Placez ici `yolo11n.onnx`, exporté avec une entrée 640×640 :
```bash
pip install ultralytics
yolo export model=yolo11n.pt format=onnx imgsz=640 simplify=True
```
Le parseur accepte les sorties `[1,84,8400]` et `[1,8400,84]`.
