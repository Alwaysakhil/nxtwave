$ErrorActionPreference = 'Stop'
$localDirectory = Join-Path $env:LOCALAPPDATA 'PocketPlan'
$pidFile = Join-Path $localDirectory 'services.json'
if (-not (Test-Path $pidFile)) {
    Write-Host 'No PocketPlan services were started by run-local.bat.'
    exit 0
}

$mysqlClient = 'C:\Program Files\MySQL\MySQL Server 8.4\bin\mysqladmin.exe'
$mysqlOptions = Join-Path $localDirectory 'mysql-root.ini'
$records = @(Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json)
foreach ($record in $records) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($record.id)" -ErrorAction SilentlyContinue
    if (-not $process -or $process.ExecutablePath -ne $record.executable -or
        -not $process.CommandLine -or -not $process.CommandLine.Contains($record.marker)) {
        Write-Host "$($record.name) is already stopped."
        continue
    }
    if ($record.type -eq 'mysql') {
        $mysqlOptionArgument = '--defaults-extra-file="{0}"' -f $mysqlOptions
        & $mysqlClient $mysqlOptionArgument shutdown
        if ($LASTEXITCODE -ne 0) {
            throw 'MySQL could not be stopped cleanly; its data has been left untouched.'
        }
        $deadline = (Get-Date).AddSeconds(30)
        while ((Get-Date) -lt $deadline) {
            $client = New-Object System.Net.Sockets.TcpClient
            try {
                $result = $client.BeginConnect('127.0.0.1', 3306, $null, $null)
                $stillRunning = $result.AsyncWaitHandle.WaitOne(500)
                if ($stillRunning) {
                    try { $client.EndConnect($result) } catch { break }
                } else {
                    break
                }
            } finally {
                $client.Dispose()
            }
            Start-Sleep -Milliseconds 500
        }
        Write-Host 'Stopped MySQL cleanly.'
        Remove-Item -LiteralPath (Join-Path $localDirectory 'mysql-process.json') `
            -ErrorAction SilentlyContinue
    } else {
        Stop-Process -Id $record.id -ErrorAction Stop
        Write-Host "Stopped $($record.name)."
    }
}

Remove-Item -LiteralPath $pidFile -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $localDirectory 'mysql-process.json') -ErrorAction SilentlyContinue
