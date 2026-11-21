# Default Railway image: publish and serve the Blazor WebAssembly client.
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY WebAR.Client/WebAR.Client.csproj WebAR.Client/
RUN dotnet restore WebAR.Client/WebAR.Client.csproj

COPY WebAR.Client/ WebAR.Client/
RUN dotnet publish WebAR.Client/WebAR.Client.csproj \
    --configuration Release \
    --no-restore \
    --output /app/publish

FROM nginx:1.29-alpine AS final
COPY WebAR.Client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/publish/wwwroot /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://127.0.0.1:8080/ || exit 1
