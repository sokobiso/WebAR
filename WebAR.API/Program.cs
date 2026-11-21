var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

builder.Services.AddControllers();
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();
builder.Services.AddCors(options => options.AddPolicy("Client", policy => policy.WithOrigins("http://localhost:5202").AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseAuthorization();
app.UseCors("Client");

app.MapControllers();
app.MapGet("/api/health", () => Results.Ok(new { status = "ok", service = "WebAR.API", utc = DateTimeOffset.UtcNow }));

app.Run();
