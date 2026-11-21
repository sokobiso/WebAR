# Default Railway image: run the interactive Blazor Server client.
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY WebAR.Client/WebAR.Client.csproj WebAR.Client/
RUN dotnet restore WebAR.Client/WebAR.Client.csproj
COPY WebAR.Client/ WebAR.Client/
RUN dotnet publish WebAR.Client/WebAR.Client.csproj --configuration Release --no-restore --output /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
ENV ASPNETCORE_URLS=http://+:8080 ASPNETCORE_ENVIRONMENT=Production
EXPOSE 8080
COPY --from=build /app/publish .
USER $APP_UID
ENTRYPOINT ["dotnet", "WebAR.Client.dll"]
