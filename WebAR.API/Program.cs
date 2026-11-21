var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

builder.Services.AddControllers();
builder.Services.AddCors(options => options.AddPolicy("Client", policy => policy
    .WithOrigins("http://localhost:5202", "http://localhost:8080")
    .AllowAnyHeader()
    .AllowAnyMethod()));

var app = builder.Build();

app.UseAuthorization();
app.UseCors("Client");

app.MapControllers();
app.MapGet("/api/health", () => Results.Ok(new { status = "ok", service = "WebAR.API", utc = DateTimeOffset.UtcNow }));

app.Run();
