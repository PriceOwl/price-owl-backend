// Capture button - simplified working version
document.getElementById('captureBtn').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    
    // Inject and execute capture script directly
    chrome.scripting.executeScript({
        target: {tabId: tab.id},
        func: () => {
            // Simple overlay for selection
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.3);z-index:999999;cursor:crosshair';
            document.body.appendChild(overlay);
            
            // Instructions
            const hint = document.createElement('div');
            hint.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:white;padding:20px;border-radius:8px;z-index:1000000';
            hint.textContent = 'Click anywhere to capture price';
            document.body.appendChild(hint);
            
            overlay.addEventListener('click', () => {
                overlay.remove();
                hint.remove();
                
                // Get price
                const price = prompt('Enter the price from this page:');
                if (price) {
                    // Save to storage
                    chrome.storage.local.get(['trackedItems'], (result) => {
                        const items = result.trackedItems || [];
                        items.unshift({
                            title: document.title,
                            price: price,
                            url: window.location.href,
                            timestamp: new Date().toISOString()
                        });
                        chrome.storage.local.set({trackedItems: items});
                    });
                    
                    // Show success
                    const success = document.createElement('div');
                    success.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#4caf50;color:white;padding:15px;border-radius:8px;z-index:1000000';
                    success.textContent = 'Price tracked successfully!';
                    document.body.appendChild(success);
                    setTimeout(() => success.remove(), 3000);
                }
            });
        }
    });
    
    window.close();
});

// Tracked items button
document.getElementById('trackedItemsBtn').addEventListener('click', () => {
    const section = document.getElementById('trackedItemsSection');
    section.classList.toggle('active');
    if (section.classList.contains('active')) {
        loadTrackedItems();
    }
});

// Close tracked items
document.getElementById('closeTabBtn').addEventListener('click', () => {
    document.getElementById('trackedItemsSection').classList.remove('active');
});

// Settings button
document.getElementById('settingsBtn').addEventListener('click', () => {
    const modal = document.getElementById('settingsModal');
    if (modal) modal.style.display = 'block';
});

// Close settings
if (document.getElementById('closeSettings')) {
    document.getElementById('closeSettings').addEventListener('click', () => {
        document.getElementById('settingsModal').style.display = 'none';
    });
}

// Load tracked items
function loadTrackedItems() {
    chrome.storage.local.get(['trackedItems'], (result) => {
        const items = result.trackedItems || [];
        const container = document.getElementById('trackedItemsList');
        
        if (items.length === 0) {
            container.innerHTML = '<p style="text-align:center;color:#999;padding:20px;">No items tracked yet</p>';
            return;
        }
        
        container.innerHTML = items.map(item => `
            <div style="background:white;padding:12px;border-radius:8px;margin-bottom:8px;border:1px solid #e0e3ff;">
                <div style="font-weight:600;color:#333;">${item.title}</div>
                <div style="color:#667eea;font-size:18px;font-weight:bold;margin:5px 0;">${item.price}</div>
                <a href="${item.url}" target="_blank" style="color:#0066cc;text-decoration:none;font-size:12px;">View Product →</a>
                <div style="color:#999;font-size:11px;margin-top:5px;">${new Date(item.timestamp).toLocaleDateString()}</div>
            </div>
        `).join('');
    });
}

// Load items on popup open
loadTrackedItems();

// Welcome message
chrome.storage.local.get(['dontShowWelcome'], (result) => {
    const welcomeMsg = document.getElementById('welcomeMsg');
    if (welcomeMsg && !result.dontShowWelcome) {
        welcomeMsg.style.display = 'block';
    }
});

// Don't show again checkbox
if (document.getElementById('dontShowAgain')) {
    document.getElementById('dontShowAgain').addEventListener('change', (e) => {
        if (e.target.checked) {
            chrome.storage.local.set({dontShowWelcome: true});
            document.getElementById('welcomeMsg').style.display = 'none';
        }
    });
}
