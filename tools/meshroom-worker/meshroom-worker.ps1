param(
    [Parameter(Mandatory = $true)][string]$ApiBaseUrl,
    [Parameter(Mandatory = $true)][string]$MeshroomBatchPath,
    [Parameter(Mandatory = $true)][string]$BlenderPath,
    [string]$WorkerKey = "",
    [string]$WorkRoot = (Join-Path $PSScriptRoot "jobs")
)

$ErrorActionPreference = "Stop"
$headers = if ([string]::IsNullOrWhiteSpace($WorkerKey)) { @{} } else { @{ "X-Worker-Key" = $WorkerKey } }
$baseUrl = $ApiBaseUrl.TrimEnd('/')
New-Item -ItemType Directory -Force -Path $WorkRoot | Out-Null

Write-Host "Recherche d'un travail de reconstruction..."
$jobs = Invoke-RestMethod -Uri "$baseUrl/api/reconstruction/jobs?status=awaiting-worker" -Headers $headers
$job = $jobs | Select-Object -First 1
if ($null -eq $job) { Write-Host "Aucun travail en attente."; exit 0 }

$jobRoot = Join-Path $WorkRoot $job.id
$inputPath = Join-Path $jobRoot "input"
$outputPath = Join-Path $jobRoot "output"
$zipPath = Join-Path $jobRoot "photos.zip"
New-Item -ItemType Directory -Force -Path $inputPath, $outputPath | Out-Null

try {
    Invoke-RestMethod -Method Post -Uri "$baseUrl/api/reconstruction/jobs/$($job.id)/status" -Headers $headers -ContentType "application/json" -Body '{"status":"processing","message":"Reconstruction Meshroom en cours."}' | Out-Null
    Invoke-WebRequest -Uri "$baseUrl/api/reconstruction/jobs/$($job.id)/photos" -Headers $headers -OutFile $zipPath
    Expand-Archive -LiteralPath $zipPath -DestinationPath $inputPath -Force

    & $MeshroomBatchPath --input $inputPath --output $outputPath
    if ($LASTEXITCODE -ne 0) { throw "Meshroom a terminé avec le code $LASTEXITCODE." }

    $mesh = Get-ChildItem -LiteralPath $outputPath -Recurse -File -Filter *.obj | Select-Object -First 1
    if ($null -eq $mesh) { throw "Aucun maillage OBJ produit par Meshroom." }
    $glbPath = Join-Path $outputPath "model.glb"
    & $BlenderPath --background --python (Join-Path $PSScriptRoot "convert_to_glb.py") -- $mesh.FullName $glbPath
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $glbPath)) { throw "La conversion GLB a échoué." }

    Invoke-RestMethod -Method Post -Uri "$baseUrl/api/reconstruction/jobs/$($job.id)/result" -Headers $headers -Form @{ model = Get-Item -LiteralPath $glbPath } | Out-Null
    Write-Host "Reconstruction terminée : $glbPath"
}
catch {
    $message = $_.Exception.Message.Replace('"', '\"')
    Invoke-RestMethod -Method Post -Uri "$baseUrl/api/reconstruction/jobs/$($job.id)/status" -Headers $headers -ContentType "application/json" -Body "{`"status`":`"failed`",`"message`":`"$message`"}" | Out-Null
    throw
}
