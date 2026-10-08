$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$envFile = Join-Path $projectRoot '.env'

function Read-ProjectSettings {
    if (-not (Test-Path $envFile)) {
        throw 'The .env file is missing. Copy .env.example to .env first.'
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
    foreach ($name in @('MYSQL_DATABASE', 'MYSQL_USER')) {
        if ([Environment]::GetEnvironmentVariable($name, 'Process') -notmatch '^[A-Za-z][A-Za-z0-9_]{0,63}$') {
            throw ".env contains an invalid $name. Use letters, numbers, and underscores only."
        }
    }
    foreach ($name in @('MYSQL_PASSWORD', 'MYSQL_ROOT_PASSWORD')) {
        if ([Environment]::GetEnvironmentVariable($name, 'Process') -notmatch '^[A-Za-z0-9]{16,128}$') {
            throw "$name in .env must contain 16-128 letters and numbers only."
        }
    }
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

function Invoke-MySql([string[]]$Arguments) {
    & $mysqlExecutable @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "MySQL setup failed (exit code $LASTEXITCODE). See $mysqlLog for details."
    }
}

function Invoke-MySqlScript([string]$ScriptPath, [string[]]$Arguments) {
    Get-Content -LiteralPath $ScriptPath -Raw -Encoding ascii | & $mysqlExecutable @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "MySQL setup failed (exit code $LASTEXITCODE). See $mysqlLog for details."
    }
}

function Invoke-Npm([string]$Directory, [string[]]$Arguments) {
    Push-Location $Directory
    try {
        & $npmExecutable @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "npm failed in $Directory (exit code $LASTEXITCODE)."
        }
    } finally {
        Pop-Location
    }
}

Read-ProjectSettings

$nodeDirectory = 'C:\Program Files\nodejs'
$nodeExecutable = Join-Path $nodeDirectory 'node.exe'
$npmExecutable = Join-Path $nodeDirectory 'npm.cmd'
$mysqlBase = 'C:\Program Files\MySQL\MySQL Server 8.4'
$mysqlExecutable = Join-Path $mysqlBase 'bin\mysql.exe'
$mysqlServer = Join-Path $mysqlBase 'bin\mysqld.exe'
$localDirectory = Join-Path $env:LOCALAPPDATA 'PocketPlan'
$dataDirectory = Join-Path $localDirectory 'mysql-data'
$mysqlLog = Join-Path $localDirectory 'mysql-error.log'
$mysqlProcessFile = Join-Path $localDirectory 'mysql-process.json'

foreach ($executable in @($nodeExecutable, $npmExecutable, $mysqlExecutable, $mysqlServer)) {
    if (-not (Test-Path $executable)) {
        throw "Required program not found: $executable. Install the Windows prerequisites listed in README.md."
    }
}

$env:PATH = "$nodeDirectory;$env:PATH"
New-Item -ItemType Directory -Force -Path $localDirectory, $dataDirectory | Out-Null

Write-Host 'Installing React and Express dependencies...'
$frontendDirectory = Join-Path $projectRoot 'frontend'
$apiDirectory = Join-Path $projectRoot 'api'
Invoke-Npm $frontendDirectory @('install')
Invoke-Npm $apiDirectory @('install')

Write-Host 'Checking frontend and API tests...'
Invoke-Npm $frontendDirectory @('test')
Invoke-Npm $apiDirectory @('test')
Invoke-Npm $frontendDirectory @('run', 'build')

$configFile = Join-Path $localDirectory 'my.ini'
$mysqlClientFile = Join-Path $localDirectory 'mysql-root.ini'
$databaseClientFile = Join-Path $localDirectory 'database.ini'
$mysqlRootMarker = Join-Path $localDirectory 'mysql-root-initialized'
$rootOptionsFile = Join-Path $localDirectory 'mysql-first-start.sql'
$databaseOptionsFile = Join-Path $localDirectory 'mysql-schema-setup.sql'
$databaseName = [Environment]::GetEnvironmentVariable('MYSQL_DATABASE', 'Process')
$databaseUser = [Environment]::GetEnvironmentVariable('MYSQL_USER', 'Process')
$databasePassword = [Environment]::GetEnvironmentVariable('MYSQL_PASSWORD', 'Process')
$rootPassword = [Environment]::GetEnvironmentVariable('MYSQL_ROOT_PASSWORD', 'Process')
$wasInitialized = Test-Path (Join-Path $dataDirectory 'mysql')

if (-not $wasInitialized) {
    Write-Host 'Initializing your local MySQL database...'
    @"
[mysqld]
basedir=$($mysqlBase.Replace('\', '/'))
datadir=$($dataDirectory.Replace('\', '/'))
port=3306
bind-address=127.0.0.1
mysqlx=0
innodb_buffer_pool_size=128M
log-error=$($mysqlLog.Replace('\', '/'))
"@ | Set-Content -LiteralPath $configFile -Encoding ascii
    $initializeArgument = '--defaults-file="{0}"' -f $configFile
    $initializeStdout = Join-Path $localDirectory 'mysql-initialize.stdout.log'
    $initializeStderr = Join-Path $localDirectory 'mysql-initialize.stderr.log'
    $initialized = Start-Process -FilePath $mysqlServer `
        -ArgumentList @($initializeArgument, '--initialize-insecure', '--console') `
        -WorkingDirectory $localDirectory -Wait -PassThru `
        -RedirectStandardOutput $initializeStdout -RedirectStandardError $initializeStderr
    if ($initialized.ExitCode -ne 0) {
        throw "MySQL's local data directory could not be initialized. See $mysqlLog."
    }
}

if (-not (Test-Path $configFile)) {
    throw "The local MySQL configuration was not created: $configFile."
}

if (-not (Test-MySqlPort)) {
    Write-Host 'Starting the local MySQL database...'
    $mysqlArgument = '--defaults-file="{0}"' -f $configFile
    $serverProcess = Start-Process -FilePath $mysqlServer `
        -ArgumentList @($mysqlArgument, '--console') -WorkingDirectory $localDirectory `
        -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $localDirectory 'mysql.stdout.log') `
        -RedirectStandardError (Join-Path $localDirectory 'mysql.stderr.log')
    $deadline = (Get-Date).AddSeconds(60)
    while (-not (Test-MySqlPort) -and (Get-Date) -lt $deadline -and -not $serverProcess.HasExited) {
        Start-Sleep -Seconds 1
    }
    if (-not (Test-MySqlPort)) {
        throw "MySQL did not start. See $mysqlLog."
    }
    @{
        name = 'MySQL'
        id = $serverProcess.Id
        executable = $mysqlServer
        marker = $configFile
        started = $serverProcess.StartTime.ToUniversalTime().ToString('o')
        type = 'mysql'
    } | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $mysqlProcessFile -Encoding utf8
}

@"
[client]
user=root
password=$rootPassword
protocol=TCP
host=127.0.0.1
port=3306
"@ | Set-Content -LiteralPath $mysqlClientFile -Encoding ascii

if (-not (Test-Path $mysqlRootMarker)) {
    Write-Host 'Setting your local MySQL root password...'
    "ALTER USER 'root'@'localhost' IDENTIFIED BY '$rootPassword';" |
        Set-Content -LiteralPath $rootOptionsFile -Encoding ascii
    try {
        Invoke-MySqlScript $rootOptionsFile @('--no-defaults', '--protocol=TCP',
            '--host=127.0.0.1', '--port=3306', '--user=root', '--skip-password')
        Set-Content -LiteralPath $mysqlRootMarker -Value 'initialized' -Encoding ascii
    } finally {
        if (Test-Path $rootOptionsFile) {
            Remove-Item -LiteralPath $rootOptionsFile
        }
    }
}

@"
[client]
user=$databaseUser
password=$databasePassword
protocol=TCP
host=127.0.0.1
port=3306
database=$databaseName
"@ | Set-Content -LiteralPath $databaseClientFile -Encoding ascii

@"
CREATE DATABASE IF NOT EXISTS ``$databaseName`` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER IF NOT EXISTS '$databaseUser'@'localhost' IDENTIFIED BY '$databasePassword';
ALTER USER '$databaseUser'@'localhost' IDENTIFIED BY '$databasePassword';
GRANT SELECT, INSERT, UPDATE, DELETE ON ``$databaseName``.* TO '$databaseUser'@'localhost';
CREATE USER IF NOT EXISTS '$databaseUser'@'127.0.0.1' IDENTIFIED BY '$databasePassword';
ALTER USER '$databaseUser'@'127.0.0.1' IDENTIFIED BY '$databasePassword';
GRANT SELECT, INSERT, UPDATE, DELETE ON ``$databaseName``.* TO '$databaseUser'@'127.0.0.1';
FLUSH PRIVILEGES;
"@ | Set-Content -LiteralPath $databaseOptionsFile -Encoding ascii

try {
    $rootClientArgument = '--defaults-extra-file="{0}"' -f $mysqlClientFile
    Invoke-MySqlScript $databaseOptionsFile @($rootClientArgument)
    $migration = (Join-Path $projectRoot 'database\schema.sql')
    Invoke-MySqlScript $migration @($rootClientArgument, "--database=$databaseName")
} finally {
    if (Test-Path $databaseOptionsFile) {
        Remove-Item -LiteralPath $databaseOptionsFile
    }
}

Write-Host ''
Write-Host 'Setup complete. Double-click run-local.bat whenever you want to start PocketPlan.'
Write-Host 'Your MySQL database and passwords stay on this computer.'
