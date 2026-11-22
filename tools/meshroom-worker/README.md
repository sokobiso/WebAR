# Worker Meshroom

Ce worker traite un travail à la fois : téléchargement des photos, reconstruction avec Meshroom/AliceVision, conversion OBJ vers GLB avec Blender, puis envoi du résultat à WebAR.API.

Prérequis : PowerShell 7, Meshroom/AliceVision, Blender et idéalement un GPU NVIDIA compatible CUDA.

```powershell
./meshroom-worker.ps1 `
  -ApiBaseUrl "https://votre-api.example" `
  -MeshroomBatchPath "C:\Meshroom\meshroom_batch.exe" `
  -BlenderPath "C:\Program Files\Blender Foundation\Blender\blender.exe" `
  -WorkerKey "votre-cle-secrete"
```

Configurez la même valeur dans `Reconstruction__WorkerKey` sur WebAR.API. Pour exécuter le worker en continu, planifiez ce script toutes les minutes ou lancez-le depuis une boucle supervisée.
