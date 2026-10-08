$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$envFile = Join-Path $projectRoot '.env'
$localDirectory = Join-Path $env:LOCALAPPDATA 'PocketPlan'
$appLogDirectory = Join-Path $localDirectory 'logs'
$stateFile = Join-Path $localDirectory 'services.json'
$mysqlProcessFile = Join-Path $localDirectory 'mysql-process.json'

function Read-ProjectSettings {
    if (-not (Test-Path $envFile)) {
        throw 'First run setup-local.bat to create the local database and install dependencies.'
    }
    foreach ($line in Get-Content -LiteralPath $envFile) {
        if ($line -match '^\s*#' -or $line -notmatch '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$') {
            continue
        }
        [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2].Trim(), 'Process')
    }
    foreach ($name in @('MYSQL_DATABASE', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_ROOT_PASSWORD')) {
        if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name, 'Process'))) {
            throw ".env must set $name."
        }
    }
}

function Save-ServiceState {
    ConvertTo-Json -InputObject $processRecords -Depth 4 |
        Set-Content -LiteralPath $stateFile -Encoding utf8
}

function Wait-ForUrl([string]$Url, [string]$Service) {
    $deadline = (Get-Date).AddSeconds(90)
    while ((Get-Date) -lt $deadline) {
        try {
            Invoke-RestMethod -Uri $Url -TimeoutSec 3 | Out-Null
            Write-Host "$Service is ready."
            return
        } catch {
            Start-Sleep -Seconds 2
        }
    }
    throw "$Service did not start within 90 seconds. See the logs in $appLogDirectory."
}

function Test-MySqlPort {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $result = $client.BeginConnect('127.0.0.1', 3306, $null, $null)
        if (-not $result.AsyncWaitHandle.WaitOne(500)) {
            return $false
        }
        try {
            $client.EndConnect($result)
            return $true
        } catch {
            return $false
        }
    } finally {
        $client.Dispose()
    }
}

function Wait-ForMySql {
    $deadline = (Get-Date).AddSeconds(60)
    while ((Get-Date) -lt $deadline) {
        if (Test-MySqlPort) {
            return
        }
        Start-Sleep -Seconds 1
    }
    throw "MySQL did not start. See $(Join-Path $localDirectory 'mysql-error.log')."
}

function Register-Service([string]$Name, [System.Diagnostics.Process]$Process,
                          [string]$Executable, [string]$Marker, [string]$Log) {
    $processRecords.Add(@{
        name = $Name
        id = $Process.Id
        executable = $Executable
        marker = $Marker
        started = $Process.StartTime.ToUniversalTime().ToString('o')
    })
    Save-ServiceState
    Write-Host "$Name started. Log: $Log"
}

Read-ProjectSettings
if (-not (Test-Path (Join-Path $projectRoot 'frontend\node_modules\vite\bin\vite.js')) -or
    -not (Test-Path (Join-Path $projectRoot 'api\node_modules\express\index.js'))) {
    throw 'Run setup-local.bat once to install dependencies and prepare the database.'
}

$nodeExecutable = 'C:\Program Files\nodejs\node.exe'
$mysqlServer = 'C:\Program Files\MySQL\MySQL Server 8.4\bin\mysqld.exe'
$mysqlConfig = Join-Path $localDirectory 'my.ini'
$mysqlClientOptions = Join-Path $localDirectory 'mysql-root.ini'
$databaseConfig = Join-Path $localDirectory 'database.ini'
$appLogDirectory = Join-Path $localDirectory 'logs'
$stateFile = Join-Path $localDirectory 'services.json'
$mysqlProcessFile = Join-Path $localDirectory 'mysql-process.json'

foreach ($path in @($nodeExecutable, $mysqlServer,
        $mysqlConfig, $mysqlClientOptions, $databaseConfig)) {
    if (-not (Test-Path $path)) {
        throw "Required program or configuration is missing: $path. Run setup-local.bat."
    }
}

New-Item -ItemType Directory -Force -Path $appLogDirectory | Out-Null
$processRecords = [System.Collections.Generic.List[object]]::new()
$mysqlRunning = Test-MySqlPort
if (-not $mysqlRunning) {
    Write-Host 'Starting local MySQL...'
    $mysqlArgument = '--defaults-file="{0}"' -f $mysqlConfig
    $mysqlStdout = Join-Path $appLogDirectory 'mysql.stdout.log'
    $mysqlStderr = Join-Path $appLogDirectory 'mysql.stderr.log'
    $process = Start-Process -FilePath $mysqlServer `
        -ArgumentList @($mysqlArgument, '--console') `
        -WorkingDirectory $localDirectory -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput $mysqlStdout -RedirectStandardError $mysqlStderr
    Wait-ForMySql
    @{
        name = 'MySQL'
        id = $process.Id
        executable = $mysqlServer
        marker = $mysqlConfig
        started = $process.StartTime.ToUniversalTime().ToString('o')
        type = 'mysql'
    } | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $mysqlProcessFile -Encoding utf8
}

if (Test-Path $mysqlProcessFile) {
    $mysqlRecord = Get-Content -LiteralPath $mysqlProcessFile -Raw | ConvertFrom-Json
    $databaseProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($mysqlRecord.id)" -ErrorAction SilentlyContinue
    if ($databaseProcess -and $databaseProcess.ExecutablePath -eq $mysqlServer -and
        $databaseProcess.CommandLine -and $databaseProcess.CommandLine.Contains($mysqlConfig)) {
        $processRecords.Add($mysqlRecord)
    }
} elseif ($mysqlRunning) {
    $listener = Get-NetTCPConnection -State Listen -LocalPort 3306 -ErrorAction SilentlyContinue |
        Where-Object { $_.LocalAddress -eq '127.0.0.1' } |
        Select-Object -First 1
    if ($listener) {
        $databaseProcess = Get-CimInstance Win32_Process `
            -Filter "ProcessId = $($listener.OwningProcess)" -ErrorAction SilentlyContinue
        if ($databaseProcess -and $databaseProcess.ExecutablePath -eq $mysqlServer -and
            $databaseProcess.CommandLine -and $databaseProcess.CommandLine.Contains($mysqlConfig)) {
            $mysqlRecord = @{
                name = 'MySQL'
                id = $databaseProcess.ProcessId
                executable = $mysqlServer
                marker = $mysqlConfig
                started = $databaseProcess.CreationDate
                type = 'mysql'
            }
            $processRecords.Add($mysqlRecord)
            $mysqlRecord | ConvertTo-Json -Depth 3 |
                Set-Content -LiteralPath $mysqlProcessFile -Encoding utf8
        }
    }
}
Save-ServiceState

$env:MYSQL_HOST = '127.0.0.1'
$env:MYSQL_PORT = '3306'
$env:API_PROXY_TARGET = 'http://127.0.0.1:8080'
$env:PORT = '8080'
$env:PATH = "C:\Program Files\nodejs;$env:PATH"

$apiLog = Join-Path $appLogDirectory 'api.log'
$apiErrorLog = Join-Path $appLogDirectory 'api-error.log'
$apiEntry = Join-Path $projectRoot 'api\src\server.js'
$process = Start-Process -FilePath $nodeExecutable `
    -ArgumentList @("`"$apiEntry`"") `
    -WorkingDirectory (Join-Path $projectRoot 'api') -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput $apiLog -RedirectStandardError $apiErrorLog
Register-Service 'Node.js/Express API' $process $nodeExecutable 'api\src\server.js' $apiLog

Wait-ForUrl 'http://127.0.0.1:8080/api/health' 'Node.js API and MySQL'

$viteScript = Join-Path $projectRoot 'frontend\node_modules\vite\bin\vite.js'
$frontendLog = Join-Path $appLogDirectory 'frontend.log'
$frontendErrorLog = Join-Path $appLogDirectory 'frontend-error.log'
$process = Start-Process -FilePath $nodeExecutable `
    -ArgumentList @("`"$viteScript`"", '--host', '127.0.0.1', '--port', '5173') `
    -WorkingDirectory (Join-Path $projectRoot 'frontend') -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput $frontendLog -RedirectStandardError $frontendErrorLog
Register-Service 'React frontend' $process $nodeExecutable 'frontend\node_modules\vite\bin\vite.js' $frontendLog
Wait-ForUrl 'http://127.0.0.1:5173' 'React frontend'

Write-Host ''
Write-Host 'PocketPlan is running:'
Write-Host '  Dashboard: http://localhost:5173'
Write-Host '  Node.js API: http://localhost:8080/api/health'
Write-Host 'Double-click stop-local.bat to stop services launched by this script.'
