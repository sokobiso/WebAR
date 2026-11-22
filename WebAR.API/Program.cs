var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

builder.Services.AddControllers();
builder.Services.Configure<Microsoft.AspNetCore.Http.Features.FormOptions>(options => options.MultipartBodyLengthLimit = 250_000_000);
builder.Services.AddSingleton<WebAR.API.Services.ReconstructionStore>();
builder.Services.AddCors(options => options.AddPolicy("Client", policy => policy
    .AllowAnyOrigin()
    .AllowAnyHeader()
    .AllowAnyMethod()));

var app = builder.Build();

app.UseAuthorization();
app.UseCors("Client");

app.MapControllers();
app.MapGet("/api/health", () => Results.Ok(new { status = "ok", service = "WebAR.API", utc = DateTimeOffset.UtcNow }));

app.Run();
