#!/usr/bin/env pwsh
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$python = Join-Path $root ".venv\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $python)) {
  $python = "python"
}

$nodeModules = Join-Path $root "playground\node_modules"
if (-not (Test-Path -LiteralPath $nodeModules)) {
  throw "Falta playground/node_modules. Corré: cd playground; npm install"
}

$hostPort = if ($env:HOST_PORT) { $env:HOST_PORT } else { "8000" }
$env:HOST_PORT = $hostPort
$env:HOST_PUBLIC_URL = if ($env:HOST_PUBLIC_URL) { $env:HOST_PUBLIC_URL } else { "http://localhost:$hostPort" }
$env:VITE_HOST_URL = if ($env:VITE_HOST_URL) { $env:VITE_HOST_URL } else { "http://localhost:$hostPort" }

$host = Start-Process -PassThru -NoNewWindow -FilePath $python `
  -ArgumentList "-m", "uvicorn", "agents.host.server:app", "--reload", "--reload-dir", "agents", "--host", "127.0.0.1", "--port", $hostPort `
  -WorkingDirectory $root

$web = Start-Process -PassThru -NoNewWindow -FilePath "npm.cmd" `
  -ArgumentList "run", "dev" -WorkingDirectory (Join-Path $root "playground")

Write-Host ""
Write-Host "Agent Host: http://localhost:$hostPort"
Write-Host "Playground: http://localhost:5173"
Write-Host "Ctrl+C para detener todo."
Write-Host ""

try {
  Wait-Process -Id $host.Id, $web.Id
} finally {
  foreach ($process in @($host, $web)) {
    if ($process -and -not $process.HasExited) {
      Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    }
  }
}
