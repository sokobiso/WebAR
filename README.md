# WebAR Vision
Prototype .NET 10 : `WebAR.Client` (Blazor Server interactif, caméra JS, YOLO11n/ONNX Runtime Web, Three.js/WebXR) et `WebAR.API` (API avec endpoint de santé).

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

## Railway

Créez deux services depuis le même dépôt. Conservez la racine du dépôt comme contexte et configurez le chemin du Dockerfile de chaque service :

- client : `WebAR.Client/Dockerfile`
- API : `WebAR.API/Dockerfile`

Ne configurez pas `WebAR.Client` ou `WebAR.API` comme dossier racine. Le client doit impérativement être construit avec son Dockerfile afin de servir la sortie publiée Blazor (`/app/publish/wwwroot`), et non le dossier source `wwwroot`.

Le `Dockerfile` et le `railway.json` placés à la racine configurent le client par défaut. Pour le service API, sélectionnez explicitement `WebAR.API/Dockerfile` dans ses paramètres Railway.
