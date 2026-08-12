function loadVouchers() {
    if (!organization || !organization.id) {
        document.getElementById('voucherTotal').textContent = '0';
        document.getElementById('voucherUnused').textContent = '0';
        document.getElementById('voucherUsed').textContent = '0';
        document.getElementById('voucherCountBadge').textContent = '0';
        document.getElementById('vouchersTable').innerHTML = '<tr><td colspan="5" class="empty-state">No vouchers found</td></tr>';
        return;
    }

    fetch(API_URL + '/admin/vouchers', {
        headers: {
            'Authorization': 'Bearer ' + token
        }
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
        if (data.success) {
            var vouchers = data.data || [];
            var used = data.used || 0;
            var unused = data.unused || 0;
            
            document.getElementById('voucherTotal').textContent = vouchers.length;
            document.getElementById('voucherUnused').textContent = unused;
            document.getElementById('voucherUsed').textContent = used;
            document.getElementById('voucherCountBadge').textContent = vouchers.length;

            if (vouchers.length === 0) {
                document.getElementById('vouchersTable').innerHTML = '<tr><td colspan="5" class="empty-state">No vouchers found</td></tr>';
                return;
            }

            var html = '';
            vouchers.slice(0, 50).forEach(function(v) {
                html += '<tr>' +
                    '<td><span class="voucher-code">' + v.code + '</span></td>' +
                    '<td>' + (v.planName || v.planId || 'N/A') + '</td>' +
                    '<td><span style="color:' + (v.used ? '#ff6b6b' : '#00c853') + ';">' + (v.used ? '❌ Used' : '✅ Available') + '</span></td>' +
                    '<td>' + (v.usedBy || '-') + '</td>' +
                    '<td style="font-size:11px;">' + new Date(v.createdAt).toLocaleDateString() + '</td>' +
                    '</tr>';
            });
            document.getElementById('vouchersTable').innerHTML = html;
        }
    })
    .catch(function(err) {
        console.error('Error loading vouchers:', err);
        document.getElementById('vouchersTable').innerHTML = '<tr><td colspan="5" class="empty-state">Error loading vouchers</td></tr>';
    });
}
