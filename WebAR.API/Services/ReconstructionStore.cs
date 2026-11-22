using System.Collections.Concurrent;

namespace WebAR.API.Services;

public sealed record ReconstructionJob(Guid Id, string Status, int PhotoCount, DateTimeOffset CreatedAt, string? Message = null, string? ResultFileName = null);

public sealed class ReconstructionStore(IWebHostEnvironment environment)
{
    private readonly ConcurrentDictionary<Guid, ReconstructionJob> _jobs = new();
    public string RootPath { get; } = Path.Combine(environment.ContentRootPath, "reconstruction-data");

    public ReconstructionJob Create(int photoCount)
    {
        Directory.CreateDirectory(RootPath);
        var job = new ReconstructionJob(Guid.NewGuid(), "awaiting-worker", photoCount, DateTimeOffset.UtcNow, "Photos reçues · en attente du worker Meshroom.");
        _jobs[job.Id] = job;
        Directory.CreateDirectory(GetInputPath(job.Id));
        Directory.CreateDirectory(GetOutputPath(job.Id));
        return job;
    }

    public IEnumerable<ReconstructionJob> List(string? status) => _jobs.Values.Where(job => status is null || job.Status.Equals(status, StringComparison.OrdinalIgnoreCase)).OrderBy(job => job.CreatedAt);
    public ReconstructionJob? Get(Guid id) => _jobs.GetValueOrDefault(id);
    public void Update(ReconstructionJob job) => _jobs[job.Id] = job;
    public string GetInputPath(Guid id) => Path.Combine(RootPath, id.ToString("N"), "input");
    public string GetOutputPath(Guid id) => Path.Combine(RootPath, id.ToString("N"), "output");
}
