$sidebarHtml = @'
                        <nav class="nav flex-column gap-1">
                            <a href="dashboard.html" class="sidebar-item">
                                <i data-lucide="layout-dashboard" class="sidebar-icon"></i> Dashboard
                            </a>
                            <a href="user-management.html" class="sidebar-item"><i data-lucide="users" class="sidebar-icon"></i> User Management</a>
                            <a href="organizer-approval.html" class="sidebar-item"><i data-lucide="user-check" class="sidebar-icon"></i> Organizer Approvals <span class="badge rounded-pill ms-auto" id="pending-org-count" style="background:#17b978;color:#fff;font-size:10px;">0</span></a>
                            <a href="event-approvals.html" class="sidebar-item"><i data-lucide="check-circle" class="sidebar-icon"></i> Event Approvals <span class="badge rounded-pill ms-auto" style="background:#17b978;color:#fff;font-size:10px;">8</span></a>
                            <a href="events.html" class="sidebar-item"><i data-lucide="calendar" class="sidebar-icon"></i> Events</a>
                            <a href="categories.html" class="sidebar-item"><i data-lucide="tag" class="sidebar-icon"></i> Categories</a>
                            <a href="venues.html" class="sidebar-item"><i data-lucide="map-pin" class="sidebar-icon"></i> Venues</a>
                            <a href="tickets-registrations.html" class="sidebar-item"><i data-lucide="ticket" class="sidebar-icon"></i> Tickets &amp; Registrations</a>
                            <a href="payments-revenue.html" class="sidebar-item"><i data-lucide="dollar-sign" class="sidebar-icon"></i> Payments &amp; Revenue</a>
                            <a href="reports-analytics.html" class="sidebar-item"><i data-lucide="bar-chart-2" class="sidebar-icon"></i> Reports &amp; Analytics</a>
                            <a href="feedback-moderation.html" class="sidebar-item"><i data-lucide="message-square" class="sidebar-icon"></i> Feedback Moderation</a>
                            <a href="notifications.html" class="sidebar-item"><i data-lucide="bell" class="sidebar-icon"></i> Notifications <span class="badge rounded-pill ms-auto" style="background:#17b978;color:#fff;font-size:10px;">5</span></a>
                            <a href="profile.html" class="sidebar-item"><i data-lucide="user" class="sidebar-icon"></i> Profile</a>
                        </nav>
'@

$adminPages = Get-ChildItem -Path "d:\project-vsc\EMS\pages\admin\*.html"
foreach ($page in $adminPages) {
    try {
        $content = [System.IO.File]::ReadAllText($page.FullName)
        $pattern = '(?s)<nav class="nav flex-column gap-1">.*?</nav>'
        
        $activeItem = $page.Name
        $customSidebar = $sidebarHtml.Replace("<a href=""$activeItem"" class=""sidebar-item"">", "<a href=""$activeItem"" class=""sidebar-item active"">")
        
        if ($content -match $pattern) {
            $newContent = $content -replace $pattern, $customSidebar
            [System.IO.File]::WriteAllText($page.FullName, $newContent)
            Write-Host "Updated sidebar for $($page.Name)"
        } else {
            Write-Warning "Could not find nav block in $($page.Name)"
        }
    } catch {
        Write-Error "Failed to process $($page.Name): $($_.Exception.Message)"
    }
}
