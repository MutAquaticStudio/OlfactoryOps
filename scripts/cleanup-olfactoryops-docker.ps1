param(
  [switch]$Apply
)

$ErrorActionPreference = "Stop"
$repoScope = "olfactoryops"

function Invoke-Safe {
  param(
    [string]$Label,
    [scriptblock]$Action,
    [switch]$PrintOnly
  )
  if ($PrintOnly) {
    Write-Output "[DRY-RUN] $Label"
    return
  }
  Write-Output "[APPLY] $Label"
  try {
    & $Action
  } catch {
    Write-Output "[WARN] $Label failed (non-fatal in this script): $($_.Exception.Message)"
  }
}

function Get-FilteredResources {
  param([string]$Type, [string]$Filter)

  $raw = @()
  switch ($Type) {
    "container" { $raw = docker ps -a --filter "name=$Filter" --format "{{.ID}} {{.Names}}" 2>$null }
    "image" { $raw = docker images --format "{{.Repository}} {{.ID}}" | Where-Object { $_ -like "*$Filter*" } }
    "volume" { $raw = docker volume ls --filter "name=$Filter" --format "{{.Name}}" 2>$null }
    "network" { $raw = docker network ls --filter "name=$Filter" --format "{{.Name}}" 2>$null }
    default { $raw = @() }
  }
  return @($raw | Where-Object { $_ -and $_.Trim() })
}

function Get-DockerUsage {
  $usage = docker system df -v 2>$null
  if ($LASTEXITCODE -ne 0) {
    return "<Docker usage unavailable>"
  }
  return ($usage | Out-String).TrimEnd()
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Output "docker not found. No local resources were touched."
  exit 0
}

$previousErrorAction = $ErrorActionPreference
try {
  $ErrorActionPreference = "SilentlyContinue"
  docker info 2>$null | Out-Null
} finally {
  $ErrorActionPreference = $previousErrorAction
}
if ($LASTEXITCODE -ne 0) {
  Write-Output "Docker engine is not available. No local resources were touched."
  exit 0
}

$beforeUsage = Get-DockerUsage
if ($beforeUsage -ne "<Docker usage unavailable>") {
  Write-Output "BEFORE_DOCKER_USAGE:"
  Write-Output $beforeUsage
}

$report = New-Object System.Collections.Generic.List[string]

$containers = Get-FilteredResources -Type container -Filter "*$repoScope*"
foreach ($entry in $containers) {
  $parts = $entry -split " ", 2
  $id = $parts[0]
  $name = $parts[1]
  $report.Add("container $id $name")
}

$images = Get-FilteredResources -Type image -Filter $repoScope
foreach ($entry in $images) {
  $parts = $entry -split " ", 2
  $repo = $parts[0]
  $id = $parts[1]
  $report.Add("image $id $repo")
}

$volumes = Get-FilteredResources -Type volume -Filter $repoScope
foreach ($vol in $volumes) { $report.Add("volume $vol") }

$networks = Get-FilteredResources -Type network -Filter "$repoScope"
foreach ($net in $networks) { $report.Add("network $net") }

if ($report.Count -eq 0) {
  Write-Output "No scoped resources found."
  exit 0
}

Write-Output "Scoped resources:"
$report | ForEach-Object { Write-Output " - $_" }

if (-not $Apply) {
  Write-Output ""
  Write-Output "Dry run complete. Add -Apply to remove these resources."
  exit 0
}

foreach ($line in $report) {
  $parts = $line -split " ", 3
  $type = $parts[0]
  $id = $parts[1]
  $name = if ($parts.Count -gt 2) { $parts[2] } else { $id }

  switch ($type) {
    "container" {
      Invoke-Safe -Label "Stop/remove container $name" -Action { docker rm -f $id } -PrintOnly:(!$Apply)
    }
    "image" {
      Invoke-Safe -Label "Remove image $name" -Action { docker rmi -f $id } -PrintOnly:(!$Apply)
    }
    "volume" {
      Invoke-Safe -Label "Remove volume $id" -Action { docker volume rm -f $id } -PrintOnly:(!$Apply)
    }
    "network" {
      Invoke-Safe -Label "Remove network $id" -Action { docker network rm $id } -PrintOnly:(!$Apply)
    }
  }
}

if ($beforeUsage -ne "<Docker usage unavailable>") {
  $afterUsage = Get-DockerUsage
  Write-Output "AFTER_DOCKER_USAGE:"
  Write-Output $afterUsage
}

Write-Output "Cleanup completed."
