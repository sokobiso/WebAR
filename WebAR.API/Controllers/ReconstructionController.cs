using System.IO.Compression;
using Microsoft.AspNetCore.Mvc;
using WebAR.API.Services;

namespace WebAR.API.Controllers;

[ApiController]
[Route("api/reconstruction/jobs")]
public sealed class ReconstructionController(ReconstructionStore store, IConfiguration configuration) : ControllerBase
{
    [HttpPost]
    [RequestSizeLimit(250_000_000)]
    public async Task<IActionResult> Create([FromForm] List<IFormFile> photos, CancellationToken cancellationToken)
    {
        if (photos.Count is < 24 or > 36) return BadRequest(new { message = "Envoyez entre 24 et 36 photos." });
        if (photos.Any(photo => photo.Length == 0 || photo.Length > 15_000_000 || !photo.ContentType.StartsWith("image/"))) return BadRequest(new { message = "Chaque fichier doit être une image de 15 Mo maximum." });
        var job = store.Create(photos.Count);
        for (var index = 0; index < photos.Count; index++)
        {
            var path = Path.Combine(store.GetInputPath(job.Id), $"photo-{index + 1:00}.jpg");
            await using var output = System.IO.File.Create(path);
            await photos[index].CopyToAsync(output, cancellationToken);
        }
        return AcceptedAtAction(nameof(Get), new { id = job.Id }, job);
    }

    [HttpGet]
    public IActionResult List([FromQuery] string? status = null) => Ok(store.List(status));

    [HttpGet("{id:guid}")]
    public IActionResult Get(Guid id) => store.Get(id) is { } job ? Ok(job) : NotFound();

    [HttpGet("{id:guid}/photos")]
    public IActionResult DownloadPhotos(Guid id)
    {
        if (store.Get(id) is null) return NotFound();
        var memory = new MemoryStream();
        using (var archive = new ZipArchive(memory, ZipArchiveMode.Create, true))
            foreach (var file in Directory.EnumerateFiles(store.GetInputPath(id))) archive.CreateEntryFromFile(file, Path.GetFileName(file), CompressionLevel.Fastest);
        memory.Position = 0;
        return File(memory, "application/zip", $"scan-{id:N}.zip");
    }

    [HttpPost("{id:guid}/status")]
    public IActionResult UpdateStatus(Guid id, [FromBody] WorkerStatus update)
    {
        if (!WorkerAuthorized()) return Unauthorized();
        if (store.Get(id) is not { } job) return NotFound();
        var updated = job with { Status = update.Status, Message = update.Message };
        store.Update(updated); return Ok(updated);
    }

    [HttpPost("{id:guid}/result")]
    [RequestSizeLimit(250_000_000)]
    public async Task<IActionResult> UploadResult(Guid id, IFormFile model, CancellationToken cancellationToken)
    {
        if (!WorkerAuthorized()) return Unauthorized();
        if (store.Get(id) is not { } job) return NotFound();
        if (!Path.GetExtension(model.FileName).Equals(".glb", StringComparison.OrdinalIgnoreCase)) return BadRequest(new { message = "Le résultat doit être un fichier GLB." });
        var fileName = "model.glb"; await using var output = System.IO.File.Create(Path.Combine(store.GetOutputPath(id), fileName)); await model.CopyToAsync(output, cancellationToken);
        var updated = job with { Status = "completed", Message = "Reconstruction terminée.", ResultFileName = fileName }; store.Update(updated); return Ok(updated);
    }

    [HttpGet("{id:guid}/result")]
    public IActionResult DownloadResult(Guid id)
    {
        if (store.Get(id) is not { Status: "completed", ResultFileName: { } fileName }) return NotFound();
        return PhysicalFile(Path.Combine(store.GetOutputPath(id), fileName), "model/gltf-binary", $"scan-{id:N}.glb");
    }

    private bool WorkerAuthorized() => string.IsNullOrWhiteSpace(configuration["Reconstruction:WorkerKey"]) || Request.Headers["X-Worker-Key"] == configuration["Reconstruction:WorkerKey"];
    public sealed record WorkerStatus(string Status, string? Message);
}
