# This service is built from the repository root on Railway.
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
# Prepare the persistent ASP.NET Core Data Protection key directory before
# dropping privileges. Docker copies this ownership into a newly created volume.
RUN mkdir -p /home/app/.aspnet/DataProtection-Keys \
    && chown -R $APP_UID:$APP_UID /home/app/.aspnet
USER $APP_UID
ENTRYPOINT ["dotnet", "WebAR.Client.dll"]
