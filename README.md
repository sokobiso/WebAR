# WebAR Vision
Prototype .NET 10 : `WebAR.Client` (Blazor WebAssembly, caméra JS, YOLO11n/ONNX Runtime Web, Three.js/WebXR) et `WebAR.API` (API avec endpoint de santé).

## Démarrage
1. Copier `yolo11n.onnx` dans `WebAR.Client/wwwroot/models/` (instructions dans ce dossier).
2. `dotnet run --project WebAR.API`
3. `dotnet run --project WebAR.Client`
4. Ouvrir `http://localhost:5202` puis autoriser la caméra.

La caméra exige un contexte sécurisé : `localhost` fonctionne en développement; sur téléphone, servez en HTTPS. Les bibliothèques JS sont chargées depuis jsDelivr dans ce prototype.

## Docker

Construire et démarrer le client et l'API :

```bash
docker compose up --build
```

- Client WebAR : `http://localhost:8080`
- API : `http://localhost:8081`
- Santé de l'API via le proxy du client : `http://localhost:8080/api/health`

Arrêter les conteneurs :

```bash
docker compose down
```
