<#
.SYNOPSIS
    Transfers OCTGN MTG card images to Proxmox LXC Server (CT 117).
.DESCRIPTION
    Streams the 83,911 OCTGN card images directly over the 10Gbps LAN to Proxmox
    and extracts them into /opt/cute-mtg/images/Sets/ on CT 117.
    Uses sequential tar streaming to maximize HDD write speeds and avoid head thrashing.
#>

param(
    [string]$ProxmoxHost = "",
    [int]$CtId = 117,
    [switch]$CreateArchiveOnly
)

$OctgnDir = "C:\Users\Emily\AppData\Local\Programs\OCTGN\Data\ImageDatabase\A6C8D2E8-7CD8-11DD-8F94-E62B56D89593"

if (-not (Test-Path "$OctgnDir\Sets")) {
    Write-Error "OCTGN Sets directory not found at $OctgnDir\Sets"
    exit 1
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " OCTGN Image Transfer Tool for MTG LAN Server (CT $CtId)" -ForegroundColor Cyan
Write-Host " Source: $OctgnDir\Sets" -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Cyan

if ($CreateArchiveOnly) {
    Write-Host "[*] Creating local uncompressed archive octgn-images.tar..." -ForegroundColor Yellow
    tar.exe -cf octgn-images.tar -C $OctgnDir Sets
    Write-Host "[+] octgn-images.tar created successfully!" -ForegroundColor Green
    Write-Host "You can upload octgn-images.tar to your Proxmox host and run ./update-mtg-server.sh"
    exit 0
}

if (-not $ProxmoxHost) {
    $ProxmoxHost = Read-Host "Enter your Proxmox Host IP or hostname (e.g. 10.42.69.1 or pve)"
}

if (-not $ProxmoxHost) {
    Write-Error "Proxmox Host is required."
    exit 1
}

Write-Host "`n[*] Ensuring /opt/cute-mtg/images directory exists inside CT $CtId..." -ForegroundColor Yellow
ssh "root@$ProxmoxHost" "pct exec $CtId -- mkdir -p /opt/cute-mtg/images"

Write-Host "[*] Streaming OCTGN card images over 10Gbps LAN directly into CT $CtId..." -ForegroundColor Yellow
Write-Host "    (This reads sequentially from your PC and extracts sequentially on the server HDD)`n" -ForegroundColor DarkGray

$startTime = Get-Date

cmd.exe /c "tar -cf - -C `"$OctgnDir`" Sets | ssh root@$ProxmoxHost `"pct exec $CtId -- tar -xf - -C /opt/cute-mtg/images`""

$duration = (Get-Date) - $startTime

Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host " Image transfer complete in $([int]$duration.TotalSeconds) seconds!" -ForegroundColor Green
Write-Host " All card images are now available locally on CT $CtId." -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
