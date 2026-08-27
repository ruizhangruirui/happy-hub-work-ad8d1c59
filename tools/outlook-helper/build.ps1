$ErrorActionPreference = "Stop"
dotnet restore .\TeamWorkbench.OutlookHelper.csproj
dotnet build .\TeamWorkbench.OutlookHelper.csproj -c Release --no-restore
dotnet run --project .\TeamWorkbench.OutlookHelper.csproj -c Release --no-build -- --self-test
