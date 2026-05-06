/* ============================================================
   BAGASKARABOT DASHBOARD — Client JavaScript
   ============================================================ */

const socket = io({ reconnectionDelay: 2000, reconnectionAttempts: Infinity });
let allStocks  = [];
let allCatalog = [];

// ── Socket Reconnect Notification ──────────────────────────────────────────────
socket.on('disconnect', () => showToast('🔌 Koneksi terputus — mencoba reconnect...'));
socket.on('connect',   () => { showToast('🟢 Dashboard terhubung!'); loadOverviewStats(); });

// ── Router ─────────────────────────────────────────────────────────────────────

document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        const page = item.dataset.page;

        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

        item.classList.add('active');
        document.getElementById(`page-${page}`)?.classList.add('active');

        // Lazy load data
        if (page === 'stocks')    loadStocks();
        if (page === 'catalog')   loadCatalog();
        if (page === 'logs')      loadLogs();
        if (page === 'settings')  loadSettings();
        if (page === 'penjualan') loadSales();
    });
});

// ── Init ────────────────────────────────────────────────────────────────────────

async function init() {
    loadOverviewStats();

    // Posting toggle
    const chk = document.getElementById('chk-posting');
    chk.addEventListener('change', () => {
        socket.emit('togglePosting', chk.checked);
    });
}

// ── Overview ────────────────────────────────────────────────────────────────────

async function loadOverviewStats() {
    try {
        const res  = await fetch('/api/stats');
        const data = await res.json();
        if (data.error) return;

        document.getElementById('stat-ready').textContent = data.readyCount ?? '-';
        document.getElementById('stat-jalan').textContent = data.jalanCount ?? '-';
        document.getElementById('stat-total').textContent = data.totalStock ?? '-';
        document.getElementById('stat-stale').textContent = data.staleCount ?? '-';

        // Omzet cards
        const modal = document.getElementById('stat-modal');
        const omzet = document.getElementById('stat-omzet');
        if (modal) modal.textContent = 'Rp ' + (data.modalTertahan || 0).toLocaleString('id-ID');
        if (omzet) omzet.textContent = 'Rp ' + (data.potensiOmzet  || 0).toLocaleString('id-ID');

        // Stale alert banner
        const alertEl = document.getElementById('stale-alert');
        if (alertEl && data.staleCount > 0) {
            alertEl.style.display = 'block';
            document.getElementById('stale-alert-title').textContent = `${data.staleCount} Stok Menganggur >30 Hari`;
            document.getElementById('stale-alert-desc').textContent  =
                `Modal tertahan: Rp ${(data.modalTertahan || 0).toLocaleString('id-ID')}. Pertimbangkan harga turun atau promosi.`;
        } else if (alertEl) {
            alertEl.style.display = 'none';
        }
    } catch (e) {
        console.error('Failed to load stats:', e);
    }
}

// ── Stocks ─────────────────────────────────────────────────────────────────────

let stockTracks = {};
let sortKey     = 'age';
let sortDir     = 'desc';

async function loadStocks() {
    try {
        const [res, trackRes] = await Promise.all([
            fetch('/api/stocks'),
            fetch('/api/stocktracks'),
        ]);
        allStocks   = await res.json();
        const tracks = await trackRes.json();

        // Index tracks by stock_id
        stockTracks = {};
        tracks.forEach(t => { stockTracks[t.stock_id] = t; });

        // Hitung usia hari tiap item
        const now = Date.now();
        allStocks.forEach(s => {
            const d = new Date(s.created_at);
            s.age   = isNaN(d) ? 9999 : Math.floor((now - d) / 86400000);
        });

        updateInventorySummary(allStocks);
        populateUserFilter(allStocks);
        applyFilters();
    } catch (e) {
        document.getElementById('tbody-stocks').innerHTML =
            `<tr><td colspan="7" class="loading">❌ Gagal memuat: ${e.message}</td></tr>`;
    }
}

function updateInventorySummary(data) {
    const total  = data.length;
    const ready  = data.filter(s => s.status === 'Ready').length;
    const jalan  = data.filter(s => s.status !== 'Ready').length;
    const stale  = data.filter(s => s.age > 7 && s.status === 'Ready').length;
    const users  = new Set(data.map(s => s.user_name || s.user_id)).size;

    document.getElementById('inv-total').textContent = total;
    document.getElementById('inv-ready').textContent = ready;
    document.getElementById('inv-jalan').textContent = jalan;
    document.getElementById('inv-stale').textContent = stale;
    document.getElementById('inv-users').textContent = users;
}

function populateUserFilter(data) {
    const sel   = document.getElementById('filter-user');
    const users = [...new Set(data.map(s => s.user_name || s.user_id))].sort();
    const current = sel.value;
    sel.innerHTML = '<option value="">Semua Pemilik</option>' +
        users.map(u => `<option value="${u}" ${u === current ? 'selected' : ''}>${u}</option>`).join('');
}

function applyFilters() {
    const q      = document.getElementById('filter-stocks').value.toLowerCase();
    const status = document.getElementById('filter-status').value;
    const user   = document.getElementById('filter-user').value;
    const age    = document.getElementById('filter-age').value;

    let data = allStocks.filter(s => {
        const matchQ    = !q || s.item_name?.toLowerCase().includes(q) || (s.user_name || '').toLowerCase().includes(q);
        const matchStat = !status || s.status === status;
        const matchUser = !user || (s.user_name || s.user_id) === user;
        let   matchAge  = true;
        if (age === '1')   matchAge = s.age <= 1;
        else if (age === '7')  matchAge = s.age <= 7;
        else if (age === '30') matchAge = s.age <= 30;
        else if (age === '30+') matchAge = s.age > 30;
        return matchQ && matchStat && matchUser && matchAge;
    });

    // Sort
    data = sortData(data, sortKey, sortDir);
    renderStocks(data);
}

function sortData(data, key, dir) {
    return [...data].sort((a, b) => {
        let va = a[key] ?? '';
        let vb = b[key] ?? '';
        if (typeof va === 'string') va = va.toLowerCase();
        if (typeof vb === 'string') vb = vb.toLowerCase();
        if (va < vb) return dir === 'asc' ? -1 : 1;
        if (va > vb) return dir === 'asc' ? 1 : -1;
        return 0;
    });
}

function sortTable(key) {
    if (sortKey === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    else { sortKey = key; sortDir = key === 'age' ? 'desc' : 'asc'; }

    document.querySelectorAll('thead th.sortable').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
        if (th.dataset.col === key) th.classList.add(sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
    });
    applyFilters();
}

function ageBadge(days) {
    if (days <= 1)  return `<span class="age-badge age-fresh">Hari ini</span>`;
    if (days <= 7)  return `<span class="age-badge age-normal">${days} hari</span>`;
    if (days <= 30) return `<span class="age-badge age-warn">${days} hari ⚠️</span>`;
    return `<span class="age-badge age-danger">${days} hari 🔴</span>`;
}

function renderStocks(data) {
    const tbody = document.getElementById('tbody-stocks');
    const label = document.getElementById('stock-count-label');
    label.textContent = `Menampilkan ${data.length} dari ${allStocks.length} unit`;

    if (!data.length) {
        tbody.innerHTML = `<tr><td colspan="8" class="loading">Tidak ada data untuk filter ini.</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(s => {
        const statusBadge = s.status === 'Ready'
            ? `<span class="badge badge-green">✅ Ready</span>`
            : `<span class="badge badge-blue">🚚 Di Jalan</span>`;

        const dateStr = s.created_at
            ? new Date(s.created_at).toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'2-digit' })
            : '-';

        const track = stockTracks[s.id];
        const resiInfo = track
            ? `<span style="font-size:11px">${track.courier?.toUpperCase() || '-'}<br><span style="color:var(--sub)">${track.awb || '-'}</span></span>`
            : `<span style="color:var(--sub);font-size:11px">—</span>`;

        // Toggle status label
        const toggleLabel  = s.status === 'Ready' ? '🚚' : '✅';
        const toggleTitle  = s.status === 'Ready' ? 'Ubah ke Di Jalan' : 'Ubah ke Ready';
        const nextStatus   = s.status === 'Ready' ? 'Not Ready' : 'Ready';

        // Tombol input resi hanya untuk Di Jalan + belum punya track
        const hasTrack = !!stockTracks[s.id];
        const resiBtn  = s.status !== 'Ready'
            ? `<button class="act-btn ${hasTrack ? '' : 'success'}" title="${hasTrack ? 'Update Resi' : 'Input Resi Pengiriman'}" onclick="openResiModal('${s.id}','${escapeHtml(s.item_name).replace(/'/g,"\\'")}')">📩</button>`
            : '';

        return `<tr>
            <td style="color:var(--sub);font-size:11px">${s.id}</td>
            <td><span class="badge badge-yellow">${escapeHtml(s.user_name || s.user_id)}</span></td>
            <td><strong>${escapeHtml(s.item_name)}</strong></td>
            <td>${statusBadge}</td>
            <td style="font-size:12px">${dateStr}</td>
            <td>${ageBadge(s.age ?? 0)}</td>
            <td>${resiInfo}</td>
            <td style="white-space:nowrap">
                <button class="act-btn" title="Rename" onclick="renameStock('${s.id}','${escapeHtml(s.item_name).replace(/'/g,"\\'")}')">✏️</button>
                ${resiBtn}
                <button class="act-btn success" title="${toggleTitle}" onclick="toggleStatus('${s.id}','${nextStatus}')">${toggleLabel}</button>
                <button class="act-btn" title="Tandai Terjual" onclick="openSellModal('${s.id}','${escapeHtml(s.item_name).replace(/'/g,"\\'")}')">💸</button>
                <button class="act-btn danger" title="Hapus" onclick="deleteStock('${s.id}','${escapeHtml(s.item_name).replace(/'/g,"\\'")}')">🗑️</button>
            </td>
        </tr>`;
    }).join('');
}

// ── CRUD Actions ────────────────────────────────────────────────────────────────

async function renameStock(id, currentName) {
    const newName = prompt(`Rename barang:\n(sekarang: "${currentName}")`, currentName);
    if (!newName || newName.trim() === currentName) return;
    try {
        const res = await fetch(`/api/stocks/${id}/rename`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ item_name: newName.trim() })
        });
        const data = await res.json();
        if (data.ok) { showToast('✅ Nama berhasil diubah!'); loadStocks(); }
        else showToast(`❌ ${data.error}`);
    } catch (e) { showToast(`❌ Error: ${e.message}`); }
}

async function toggleStatus(id, newStatus) {
    const label = newStatus === 'Ready' ? '✅ Ready' : '🚚 Di Jalan';
    if (!confirm(`Ubah status ke ${label}?`)) return;
    try {
        const res = await fetch(`/api/stocks/${id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });
        const data = await res.json();
        if (data.ok) { showToast(`✅ Status diubah ke ${label}`); loadStocks(); }
        else showToast(`❌ ${data.error}`);
    } catch (e) { showToast(`❌ Error: ${e.message}`); }
}

async function deleteStock(id, name) {
    if (!confirm(`Hapus "${name}" dari stok?\n(Tidak bisa dibatalkan)`)) return;
    try {
        const res = await fetch(`/api/stocks/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.ok) { showToast('🗑️ Stok berhasil dihapus!'); loadStocks(); }
        else showToast(`❌ ${data.error}`);
    } catch (e) { showToast(`❌ Error: ${e.message}`); }
}

// ── Modal: Add Stok ──────────────────────────────────────────────────────────────

async function openAddModal() {
    // Load daftar user
    try {
        const res   = await fetch('/api/users');
        const users = await res.json();
        const sel   = document.getElementById('modal-user');
        sel.innerHTML = users.map(u => `<option value="${escapeHtml(u.name)}">${escapeHtml(u.name)}</option>`).join('');
    } catch {}

    // Reset form
    document.getElementById('modal-item-single').value = '';
    document.getElementById('modal-item-multi').value  = '';
    document.getElementById('modal-error').style.display = 'none';
    document.getElementById('modal-multi-toggle').checked = false;
    toggleMultiMode();

    document.getElementById('modal-add-stock').classList.add('open');
}

function closeAddModal() {
    document.getElementById('modal-add-stock').classList.remove('open');
}

function closeModal(e) {
    if (e.target.classList.contains('modal-backdrop')) closeAddModal();
}

function toggleMultiMode() {
    const isMulti = document.getElementById('modal-multi-toggle').checked;
    document.getElementById('modal-item-single').style.display = isMulti ? 'none' : 'block';
    document.getElementById('modal-item-multi').style.display  = isMulti ? 'block' : 'none';
    document.getElementById('multi-label').textContent = isMulti ? 'Multi item' : '1 item';
}

async function submitAddStock() {
    const user_name = document.getElementById('modal-user').value;
    const status    = document.getElementById('modal-status').value;
    const isMulti   = document.getElementById('modal-multi-toggle').checked;
    const errEl     = document.getElementById('modal-error');

    let items = [];
    if (isMulti) {
        items = document.getElementById('modal-item-multi').value
            .split('\n').map(l => l.trim()).filter(Boolean);
    } else {
        const single = document.getElementById('modal-item-single').value.trim();
        if (single) items = [single];
    }

    if (!user_name) { errEl.textContent = '⚠️ Pilih pemilik dulu!'; errEl.style.display = 'block'; return; }
    if (!items.length) { errEl.textContent = '⚠️ Isi nama barang dulu!'; errEl.style.display = 'block'; return; }

    const btn = document.getElementById('btn-submit-add');
    btn.textContent = '⏳ Menyimpan...'; btn.disabled = true;
    errEl.style.display = 'none';

    try {
        const res  = await fetch('/api/stocks/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_name, items, status })
        });
        const data = await res.json();
        if (data.ok) {
            showToast(`✅ ${data.added.length} item berhasil ditambahkan!`);
            closeAddModal();
            loadStocks();
        } else {
            errEl.textContent = `❌ ${data.error}`;
            errEl.style.display = 'block';
        }
    } catch (e) {
        errEl.textContent = `❌ Error: ${e.message}`;
        errEl.style.display = 'block';
    } finally {
        btn.textContent = '✅ Simpan ke Google Sheets'; btn.disabled = false;
    }
}



function resetFilters() {
    document.getElementById('filter-stocks').value  = '';
    document.getElementById('filter-status').value  = '';
    document.getElementById('filter-user').value    = '';
    document.getElementById('filter-age').value     = '';
    applyFilters();
}

function exportCSV() {
    const headers = ['ID','Pemilik','Nama Barang','Status','Tanggal Masuk','Usia (Hari)','Kurir','Resi'];
    const rows = allStocks.map(s => {
        const t = stockTracks[s.id];
        return [
            s.id, s.user_name || s.user_id, s.item_name, s.status,
            s.created_at || '', s.age ?? '',
            t?.courier || '', t?.awb || '',
        ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(',');
    });
    const csv  = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `stok_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
}


// ── Catalog ─────────────────────────────────────────────────────────────────────

async function loadCatalog() {
    try {
        const res    = await fetch('/api/catalog');
        allCatalog   = await res.json();
        renderCatalog(allCatalog);
    } catch (e) {
        document.getElementById('tbody-catalog').innerHTML = `<tr><td colspan="8" class="loading">❌ Gagal memuat: ${e.message}</td></tr>`;
    }
}

function renderCatalog(data) {
    const tbody = document.getElementById('tbody-catalog');
    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="loading">Sheet Catalog kosong. Isi data produk di Google Sheets.</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(c => {
        const jual   = parseInt(c.harga_jual) || 0;
        const beli   = parseInt(c.harga_beli) || 0;
        const margin = jual - beli;
        const pct    = beli > 0 ? ((margin / beli) * 100).toFixed(1) : '-';
        const compAvg = c.competitor?.avg || 0;
        const diff    = compAvg > 0 ? jual - compAvg : null;

        const diffCell = diff !== null
            ? `<td class="${diff <= 0 ? 'positive' : 'negative'}">${diff <= 0 ? '🟢' : '🔴'} ${formatRp(Math.abs(diff))}</td>`
            : `<td class="log-dim">-</td>`;

        const compCell = compAvg > 0
            ? `${formatRp(compAvg)}<br><small style="color:var(--sub)">min: ${formatRp(c.competitor.min)}</small>`
            : '<span style="color:var(--sub)">Belum discrape</span>';

        const readyBadge = c.ready_count > 0
            ? `<span class="badge badge-green">${c.ready_count} unit</span>`
            : `<span class="badge badge-red">0</span>`;

        return `<tr>
            <td>${c.item_name}</td>
            <td>${formatRp(jual)}</td>
            <td>${formatRp(beli)}</td>
            <td class="${margin > 0 ? 'positive' : 'negative'}">${formatRp(margin)} <small>(${pct}%)</small></td>
            <td>${compCell}</td>
            ${diffCell}
            <td>${readyBadge}</td>
            <td><span class="badge ${c.kondisi === 'Baru' ? 'badge-blue' : 'badge-yellow'}">${c.kondisi}</span></td>
        </tr>`;
    }).join('');
}

// ── Penjualan (Transactions) ──────────────────────────────────────────────────

let allSales = [];

async function loadSales() {
    const tbody = document.getElementById('tbody-sales');
    tbody.innerHTML = '<tr><td colspan="7" class="loading">⏳ Memuat data penjualan...</td></tr>';
    try {
        const res = await fetch('/api/transactions');
        allSales  = await res.json();
        if (allSales.error) throw new Error(allSales.error);
        allSales.sort((a, b) => new Date(b.date) - new Date(a.date));
        renderSalesKPI(allSales);
        populateSalesFilters(allSales);
        applySalesFilter();
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="7" class="loading">❌ Gagal memuat: ${e.message}</td></tr>`;
    }
}

function renderSalesKPI(data) {
    const totalUnit  = data.length;
    const totalOmzet = data.reduce((s, t) => s + (t.harga_jual || 0), 0);
    const now        = new Date();
    const thisMonth  = data.filter(t => {
        const d = new Date(t.date);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
    const freq = {};
    data.forEach(t => { freq[t.item_name] = (freq[t.item_name] || 0) + 1; });
    const topItem = Object.entries(freq).sort((a,b) => b[1]-a[1])[0];

    document.getElementById('sales-total-unit').textContent  = totalUnit;
    document.getElementById('sales-total-omzet').textContent = 'Rp ' + totalOmzet.toLocaleString('id-ID');
    document.getElementById('sales-this-month').textContent  = thisMonth;
    document.getElementById('sales-top-item').textContent    = topItem ? `${topItem[0]} (${topItem[1]}x)` : '-';
}

function populateSalesFilters(data) {
    const selUser  = document.getElementById('filter-sales-user');
    const users    = [...new Set(data.map(t => t.user_name || t.user_id))].sort();
    const curUser  = selUser.value;
    selUser.innerHTML = '<option value="">Semua Pemilik</option>' +
        users.map(u => `<option value="${u}" ${u===curUser?'selected':''}>${u}</option>`).join('');

    const selMonth = document.getElementById('filter-sales-month');
    const months   = [...new Set(data.map(t => {
        const d = new Date(t.date);
        return isNaN(d) ? null : `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    }).filter(Boolean))].sort().reverse();
    const curMonth = selMonth.value;
    selMonth.innerHTML = '<option value="">Semua Bulan</option>' +
        months.map(m => {
            const [y,mo] = m.split('-');
            const label  = new Date(y, mo-1).toLocaleDateString('id-ID', {month:'long', year:'numeric'});
            return `<option value="${m}" ${m===curMonth?'selected':''}>${label}</option>`;
        }).join('');
}

function applySalesFilter() {
    const q     = document.getElementById('filter-sales-q').value.toLowerCase();
    const user  = document.getElementById('filter-sales-user').value;
    const month = document.getElementById('filter-sales-month').value;
    const data  = allSales.filter(t => {
        const matchQ = !q || (t.item_name||'').toLowerCase().includes(q) || (t.pembeli||'').toLowerCase().includes(q);
        const matchU = !user  || (t.user_name||t.user_id) === user;
        const matchM = !month || (t.date||'').startsWith(month);
        return matchQ && matchU && matchM;
    });
    renderSalesTable(data);
}

function resetSalesFilter() {
    document.getElementById('filter-sales-q').value     = '';
    document.getElementById('filter-sales-user').value  = '';
    document.getElementById('filter-sales-month').value = '';
    applySalesFilter();
}

function renderSalesTable(data) {
    const tbody   = document.getElementById('tbody-sales');
    const countEl = document.getElementById('sales-count-label');
    const totalEl = document.getElementById('sales-total-label');
    countEl.textContent = `Menampilkan ${data.length} dari ${allSales.length} transaksi`;
    const sub = data.reduce((s,t) => s+(t.harga_jual||0), 0);
    totalEl.textContent = sub > 0 ? `Subtotal: Rp ${sub.toLocaleString('id-ID')}` : '';
    if (!data.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="loading">Tidak ada data untuk filter ini.</td></tr>';
        return;
    }
    tbody.innerHTML = data.map(t => {
        const dateStr  = t.date
            ? new Date(t.date).toLocaleDateString('id-ID', {day:'2-digit',month:'short',year:'2-digit',hour:'2-digit',minute:'2-digit'})
            : '-';
        const hargaStr = t.harga_jual > 0
            ? `<span style="color:var(--green);font-weight:600">Rp ${t.harga_jual.toLocaleString('id-ID')}</span>`
            : `<span style="color:var(--sub)">-</span>`;
        const profitStr = t.profit > 0
            ? `<span style="font-size:10px;color:var(--green)"> +${t.profit.toLocaleString('id-ID')}</span>` : '';
        return `<tr>
            <td style="color:var(--sub);font-size:11px">${t.id}</td>
            <td style="font-size:12px;white-space:nowrap">${dateStr}</td>
            <td><span class="badge badge-yellow">${escapeHtml(t.user_name||t.user_id)}</span></td>
            <td><strong>${escapeHtml(t.item_name||'-')}</strong></td>
            <td>${hargaStr}${profitStr}</td>
            <td style="font-size:12px">${escapeHtml(t.pembeli||'-')}</td>
            <td style="font-size:11px;color:var(--sub)">${escapeHtml(t.catatan||'-')}</td>
            <td style="white-space:nowrap">
                <button class="act-btn" title="Edit Transaksi" data-id="${t.id}" onclick="openEditTxById(this.dataset.id)">✏️</button>
                <button class="act-btn danger" title="Hapus Transaksi" onclick="deleteTx('${t.id}')">🗑️</button>
            </td>
        </tr>`;
    }).join('');
}

// ── Modal: Tambah Transaksi Historis ──────────────────────────────────────────

let _editTxId = null; // null = mode tambah, string = mode edit

async function openAddTxModal() {
    _editTxId = null;
    await _openTxModal({});
    document.querySelector('#modal-add-tx .modal-header h3').textContent = '💸 Tambah Data Penjualan';
    document.getElementById('btn-submit-tx').textContent = '💸 Simpan Transaksi';
}

function openEditTxById(id) {
    const tx = allSales.find(t => String(t.id) === String(id));
    if (!tx) { showToast('❌ Data tidak ditemukan', 'error'); return; }
    _editTxId = id;
    _openTxModal(tx);
    document.querySelector('#modal-add-tx .modal-header h3').textContent = '✏️ Edit Transaksi';
    document.getElementById('btn-submit-tx').textContent = '💾 Simpan Perubahan';
}

async function _openTxModal(tx) {
    // Load users untuk dropdown
    try {
        const res   = await fetch('/api/users');
        const users = await res.json();
        const sel   = document.getElementById('tx-user');
        sel.innerHTML = '<option value="">-- Pilih Pemilik --</option>' +
            users.map(u => `<option value="${escapeHtml(u.name)}" ${u.name===tx.user_name?'selected':''}>${escapeHtml(u.name)}</option>`).join('');
    } catch {}

    // Pre-fill form
    document.getElementById('tx-item').value    = tx.item_name || '';
    document.getElementById('tx-harga').value   = tx.harga_jual || '';
    document.getElementById('tx-pembeli').value = tx.pembeli   || '';
    document.getElementById('tx-catatan').value = tx.catatan   || '';
    document.getElementById('tx-error').style.display = 'none';

    // Tanggal: ambil dari tx.date atau hari ini
    if (tx.date) {
        try { document.getElementById('tx-date').value = tx.date.slice(0,10); } catch {}
    } else {
        document.getElementById('tx-date').value = new Date().toISOString().slice(0,10);
    }

    document.getElementById('modal-add-tx').classList.add('open');
    setTimeout(() => document.getElementById('tx-item').focus(), 100);
}

function closeAddTxModal(e) {
    if (e && !e.target.classList.contains('modal-backdrop')) return;
    document.getElementById('modal-add-tx').classList.remove('open');
}

async function submitAddTx() {
    const item_name  = document.getElementById('tx-item').value.trim();
    const user_name  = document.getElementById('tx-user').value;
    const harga_jual = document.getElementById('tx-harga').value;
    const dateVal    = document.getElementById('tx-date').value;
    const pembeli    = document.getElementById('tx-pembeli').value.trim();
    const catatan    = document.getElementById('tx-catatan').value.trim();
    const errEl      = document.getElementById('tx-error');

    if (!item_name) { errEl.textContent = '⚠️ Nama barang wajib diisi!'; errEl.style.display='block'; return; }

    const btn = document.getElementById('btn-submit-tx');
    btn.disabled = true;
    btn.textContent = '⏳ Menyimpan...';
    errEl.style.display = 'none';

    try {
        const date    = dateVal ? new Date(dateVal).toISOString() : new Date().toISOString();
        const isEdit  = _editTxId !== null;
        const url     = isEdit ? `/api/transactions/${_editTxId}` : '/api/transactions/add';
        const method  = isEdit ? 'PATCH' : 'POST';

        const res  = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ item_name, user_name, harga_jual: parseInt(harga_jual)||0, date, pembeli, catatan })
        });
        const data = await res.json();

        if (data.ok) {
            showToast(isEdit ? '✅ Transaksi berhasil diperbarui!' : '✅ Transaksi berhasil ditambahkan!');
            document.getElementById('modal-add-tx').classList.remove('open');
            loadSales();
        } else {
            errEl.textContent = `❌ ${data.error}`;
            errEl.style.display = 'block';
        }
    } catch (e) {
        errEl.textContent = `❌ Error: ${e.message}`;
        errEl.style.display = 'block';
    } finally {
        btn.disabled = false;
        btn.textContent = _editTxId ? '💾 Simpan Perubahan' : '💸 Simpan Transaksi';
    }
}

async function deleteTx(id) {
    if (!confirm('Hapus transaksi ini? (Tidak bisa dibatalkan)')) return;
    try {
        const res  = await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.ok) { showToast('🗑️ Transaksi dihapus!'); loadSales(); }
        else showToast(`❌ ${data.error}`, 'error');
    } catch (e) { showToast(`❌ ${e.message}`, 'error'); }
}

async function syncFromSheets() {
    const btn = document.getElementById('btn-sync-sales');
    if (btn) { btn.textContent = '⏳ Syncing...'; btn.disabled = true; }
    try {
        await fetch('/api/cache/clear', { method: 'POST' });
        await loadSales();
        showToast('✅ Data berhasil disinkronkan dari Google Sheets!');
    } catch (e) {
        showToast('❌ Gagal sync: ' + e.message, 'error');
    } finally {
        if (btn) { btn.textContent = '🔄 Sync Sheets'; btn.disabled = false; }
    }
}

function exportSalesCSV() {
    const headers = ['ID','Tanggal','Pemilik','Nama Barang','Harga Jual','Harga Beli','Profit','Pembeli','Catatan'];
    const rows = allSales.map(t => [
        t.id, t.date, t.user_name||t.user_id, t.item_name,
        t.harga_jual, t.harga_beli, t.profit, t.pembeli||'', t.catatan||''
    ].map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(','));
    const blob = new Blob(['\uFEFF'+[headers.join(','),...rows].join('\n')], {type:'text/csv;charset=utf-8'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `penjualan_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
}

// ── Logs ────────────────────────────────────────────────────────────────────────


async function loadLogs() {
    try {
        const res  = await fetch('/api/logs/fb');
        const data = await res.json();

        const renderLogs = (lines, elId) => {
            const el = document.getElementById(elId);
            if (!lines || lines.length === 0) {
                el.innerHTML = '<div class="log-entry log-dim">Belum ada log.</div>';
                return;
            }
            el.innerHTML = lines.map(l => `<div class="log-entry">${escapeHtml(l)}</div>`).join('');
        };

        renderLogs(data.success, 'log-success');
        renderLogs(data.failed, 'log-failed');
    } catch (e) {
        document.getElementById('log-success').innerHTML = `<div class="log-entry log-error">❌ ${e.message}</div>`;
    }
}

// ── Settings ────────────────────────────────────────────────────────────────────

async function loadSettings() {
    try {
        const res  = await fetch('/api/config');
        const data = await res.json();

        const sel = document.getElementById('cfg-campaign');
        sel.innerHTML = data.campaigns.map(c => `<option value="${c}" ${c === data.config.campaign_name ? 'selected' : ''}>${c}</option>`).join('');

        document.getElementById('cfg-text').value     = data.config.custom_text_override || '';
        document.getElementById('cfg-useimage').checked = data.config.use_catalog_image !== false;
    } catch (e) {
        console.error(e);
    }
}

async function saveSettings() {
    const body = {
        campaign_name:          document.getElementById('cfg-campaign').value,
        custom_text_override:   document.getElementById('cfg-text').value,
        use_catalog_image:      document.getElementById('cfg-useimage').checked,
    };
    await fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    showToast('✅ Konfigurasi disimpan!');
}

// ── Socket Events ────────────────────────────────────────────────────────────────

socket.on('configUpdated', (cfg) => {
    const chk = document.getElementById('chk-posting');
    chk.checked = cfg.active !== false;
    const label = document.getElementById('posting-campaign-label');
    if (label) label.textContent = `Campaign: ${cfg.campaign_name || '(belum diset)'}`;
});

socket.on('waStatus', (data) => {
    const dot   = document.getElementById('dot-wa');
    const label = document.getElementById('label-wa');
    if (data.ready) { dot.className = 'dot dot-wa online'; label.textContent = 'Online'; }
    else if (data.qr) { dot.className = 'dot dot-wa warn'; label.textContent = 'Scan QR'; }
    else { dot.className = 'dot dot-wa'; label.textContent = 'Offline'; }
});

socket.on('fbStatus', (data) => {
    const dot   = document.getElementById('dot-fb');
    const label = document.getElementById('label-fb');
    if (data.loggedIn) { dot.className = 'dot dot-fb online'; label.textContent = 'Login'; }
    else { dot.className = 'dot dot-fb warn'; label.textContent = 'Perlu Login'; }
});

socket.on('cycleStart', (data) => {
    document.getElementById('dot-cycle').className  = 'dot dot-cycle online';
    document.getElementById('label-cycle').textContent = `Cycle #${data.num}`;
    document.getElementById('cycle-num').textContent   = data.num;
});

socket.on('cycleEnd', (data) => {
    document.getElementById('dot-cycle').className  = 'dot dot-cycle';
    document.getElementById('cycle-success').textContent = data.success ?? '-';
    document.getElementById('cycle-fail').textContent    = data.fail    ?? '-';
    document.getElementById('cycle-next').textContent    = data.nextIn  ? `~${data.nextIn} mnt` : '-';
    loadOverviewStats(); // Refresh stats setelah siklus selesai
});

socket.on('botLog', (data) => {
    appendConsole(data.msg, data.level);
});

// ── Console ────────────────────────────────────────────────────────────────────

function appendConsole(msg, level = 'info') {
    const out  = document.getElementById('console-output');
    const cls  = level === 'error' ? 'log-error' : level === 'warn' ? 'log-warn' : 'log-info';
    const time = new Date().toLocaleTimeString('id-ID');
    const p    = document.createElement('p');
    p.className = cls;
    p.textContent = `[${time}] ${msg}`;
    out.prepend(p);

    // Batasi max 200 baris
    while (out.children.length > 200) out.lastChild.remove();
}

function clearConsole() {
    document.getElementById('console-output').innerHTML = '<p class="log-dim">Console dibersihkan.</p>';
}

// ── Utils ──────────────────────────────────────────────────────────────────────

const formatRp = (n) => 'Rp ' + (parseInt(n) || 0).toLocaleString('id-ID');

const escapeHtml = (s) => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ── Sound Notification ──────────────────────────────────────────────────────────
const _audioCtx = typeof AudioContext !== 'undefined' ? new AudioContext() : null;

function playNotifSound(type = 'success') {
    if (!_audioCtx) return;
    const osc  = _audioCtx.createOscillator();
    const gain = _audioCtx.createGain();
    osc.connect(gain); gain.connect(_audioCtx.destination);
    osc.type = 'sine';
    const now = _audioCtx.currentTime;
    if (type === 'success') {
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.setValueAtTime(1100, now + 0.1);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now); osc.stop(now + 0.3);
    } else if (type === 'alert') {
        osc.frequency.setValueAtTime(440, now);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.start(now); osc.stop(now + 0.5);
    }
}

function showToast(msg, type = 'success') {
    playNotifSound(type === 'error' ? 'alert' : 'success');
    const t = document.createElement('div');
    t.textContent = msg;
    const bg = type === 'error' ? 'rgba(239,68,68,0.92)' : 'rgba(34,212,108,0.92)';
    Object.assign(t.style, {
        position: 'fixed', bottom: '24px', right: '24px',
        background: bg, color: type === 'error' ? '#fff' : '#000',
        padding: '12px 20px', borderRadius: '10px',
        fontSize: '13px', fontWeight: '600', zIndex: '9999',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        maxWidth: '360px', wordBreak: 'break-word'
    });
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 4000);
}

// ── Posting Page ────────────────────────────────────────────────────────────────

let scrapedGroups  = [];
let isPosting      = false;
let selectedImages = [];

// --- Tab switching ---
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        const parent = btn.closest('.glass.card') || btn.parentElement.parentElement;
        parent.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        parent.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(tab)?.classList.add('active');
    });
});

// --- Init posting page ---
async function initPostingPage() {
    const res  = await fetch('/api/config');
    const data = await res.json();
    const sel  = document.getElementById('sel-campaign');
    sel.innerHTML = '<option value="">-- Pilih Campaign --</option>' +
        data.campaigns.map(c => `<option value="${c}">${c}</option>`).join('');
}

// --- Auth check ---
async function checkFbAuth() {
    const info = document.getElementById('auth-info');
    info.className = 'auth-info';
    info.textContent = '🔄 Memeriksa...';
    socket.emit('checkFbAuth');
}

socket.on('fbAuthResult', (data) => {
    const info = document.getElementById('auth-info');
    const confirmBtn = document.getElementById('btn-confirm-login');
    if (data.loggedIn) {
        info.className = 'auth-info ok';
        info.textContent = `✅ Login sebagai: ${data.name || 'Facebook User'}`;
        confirmBtn.style.display = 'none';
    } else {
        info.className = 'auth-info fail';
        info.textContent = '⚠️ Belum login — Chrome sudah dibuka, login di browser lalu klik tombol di kanan';
        confirmBtn.style.display = 'inline-flex';
    }
});

function confirmLogin() {
    socket.emit('confirmFbLogin');
    document.getElementById('auth-info').textContent = '🔄 Memverifikasi login...';
}

// --- Load groups from campaign ---
function loadCampaignGroups() {
    const name = document.getElementById('sel-campaign').value;
    const list = document.getElementById('group-list-saved');
    list.innerHTML = '';
    if (!name) return;
    socket.emit('getCampaignGroups', name);
}

socket.on('campaignGroups', ({ name, groups }) => {
    const list  = document.getElementById('group-list-saved');
    const count = document.getElementById('group-count');
    count.textContent = `${groups.length} grup`;
    list.innerHTML = groups.map((g, i) => `
        <label class="group-item">
            <input type="checkbox" class="chk-saved" value="${i}" checked>
            <span>${g.name}</span>
        </label>`).join('');
    list.dataset.campaign = name;
    list.dataset.groups   = JSON.stringify(groups);
});

// --- Scrape groups ---
function scrapeGroups() {
    const kw     = document.getElementById('input-keyword').value.trim();
    const status = document.getElementById('scrape-status');
    status.innerHTML = '<p class="plog info">🔍 Sedang scraping grup... harap tunggu.</p>';
    document.getElementById('group-list-scrape').innerHTML = '';
    document.getElementById('scrape-save-row').style.display = 'none';
    socket.emit('scrapeGroups', kw);
}

socket.on('scrapeResult', (groups) => {
    scrapedGroups = groups;
    const list    = document.getElementById('group-list-scrape');
    const status  = document.getElementById('scrape-status');
    status.innerHTML = `<p class="plog ok">✅ Ditemukan ${groups.length} grup</p>`;
    list.innerHTML = groups.map((g, i) => `
        <label class="group-item">
            <input type="checkbox" class="chk-scrape" value="${i}" checked>
            <span>${g.name}</span>
        </label>`).join('');
    document.getElementById('scrape-save-row').style.display = 'flex';
});

function saveCampaign() {
    const name = document.getElementById('input-campaign-name').value.trim();
    if (!name) return showToast('⚠️ Isi nama campaign dulu!');
    socket.emit('saveCampaign', { name, groups: scrapedGroups });
    showToast(`✅ Campaign "${name}" disimpan!`);
    initPostingPage();
}

// --- Image preview ---
function previewImages(input) {
    const preview = document.getElementById('img-preview');
    const count   = document.getElementById('img-count');
    selectedImages = Array.from(input.files);
    preview.innerHTML = '';
    selectedImages.forEach(f => {
        const img = document.createElement('img');
        img.className = 'img-thumb';
        img.src = URL.createObjectURL(f);
        preview.appendChild(img);
    });
    count.textContent = selectedImages.length > 0 ? `${selectedImages.length} gambar dipilih` : 'Belum ada gambar';
}

// --- Start posting ---
async function startPosting() {
    if (isPosting) return;

    // Kumpulkan grup yang dipilih
    const activeTab = document.querySelector('#card-groups .tab-pane.active');
    let targetGroups = [];

    if (activeTab.id === 'tab-saved') {
        const listEl = document.getElementById('group-list-saved');
        const all    = JSON.parse(listEl.dataset.groups || '[]');
        document.querySelectorAll('.chk-saved:checked').forEach(chk => {
            targetGroups.push(all[parseInt(chk.value)]);
        });
    } else {
        document.querySelectorAll('.chk-scrape:checked').forEach(chk => {
            targetGroups.push(scrapedGroups[parseInt(chk.value)]);
        });
    }

    if (targetGroups.length === 0) return showToast('⚠️ Pilih minimal 1 grup!');

    const text  = document.getElementById('input-text').value.trim();
    const title = document.getElementById('input-title').value.trim();
    const price = document.getElementById('input-price').value.trim();
    if (!text)  return showToast('⚠️ Isi teks postingan dulu!');

    // Upload gambar jika ada
    let imageNames = [];
    if (selectedImages.length > 0) {
        const fd = new FormData();
        selectedImages.forEach(f => fd.append('images', f));
        const upRes = await fetch('/upload', { method: 'POST', body: fd });
        const upData = await upRes.json();
        imageNames = upData.filenames || [];
    }

    // Reset UI
    isPosting = true;
    document.getElementById('btn-start-posting').style.display = 'none';
    document.getElementById('btn-stop-posting').style.display  = 'inline-flex';
    document.getElementById('post-stats').style.display        = 'grid';
    document.getElementById('progress-bar-wrap').style.display = 'block';
    document.getElementById('posting-log').innerHTML = '';
    document.getElementById('ps-success').textContent = '0';
    document.getElementById('ps-fail').textContent    = '0';
    document.getElementById('ps-skip').textContent    = '0';
    document.getElementById('ps-total').textContent   = `0/${targetGroups.length}`;
    document.getElementById('progress-bar').style.width = '0%';

    socket.emit('startPosting', { targetGroups, title, price, text, images: imageNames });
}

function stopPosting() {
    socket.emit('stopPosting');
    addPostLog('⏹ Posting dihentikan oleh user.', 'info');
    resetPostingUI();
}

function resetPostingUI() {
    isPosting = false;
    document.getElementById('btn-start-posting').style.display = 'inline-flex';
    document.getElementById('btn-stop-posting').style.display  = 'none';
}

function addPostLog(msg, type = '') {
    const log = document.getElementById('posting-log');
    const p   = document.createElement('div');
    p.className = `plog ${type}`;
    p.textContent = msg;
    log.prepend(p);
}

// Socket events untuk posting manual
socket.on('postLog', (data) => {
    const type = data.includes('✅') || data.includes('Berhasil') ? 'ok'
               : data.includes('❌') || data.includes('Gagal') ? 'err' : 'info';
    addPostLog(data, type);
    appendConsole(data);
});

socket.on('postProgress', (data) => {
    document.getElementById('ps-success').textContent = data.success ?? '-';
    document.getElementById('ps-fail').textContent    = data.fail    ?? '-';
    document.getElementById('ps-skip').textContent    = data.skip    ?? '-';
    document.getElementById('ps-total').textContent   = `${data.current}/${data.total}`;
    const pct = data.total > 0 ? (data.current / data.total * 100).toFixed(0) : 0;
    document.getElementById('progress-bar').style.width = pct + '%';
});

socket.on('postComplete', (data) => {
    addPostLog(`🎉 Selesai! Berhasil: ${data.success} | Gagal: ${data.fail} | Skip: ${data.skip}`, 'ok');
    document.getElementById('progress-bar').style.width = '100%';
    resetPostingUI();
    loadLogs();
});

// ── Tracking / Cek Resi ─────────────────────────────────────────────────────────

function switchTrackMode(mode) {
    document.getElementById('mode-single').style.display = mode === 'single' ? 'block' : 'none';
    document.getElementById('mode-bulk').style.display   = mode === 'bulk'   ? 'block' : 'none';
    document.getElementById('tab-single').classList.toggle('active', mode === 'single');
    document.getElementById('tab-bulk').classList.toggle('active',   mode === 'bulk');
}

// ── Single Track ──────────────────────────────────────────────────────────────

async function singleTrack() {
    const courier = document.getElementById('si-courier').value;
    const awb     = document.getElementById('si-awb').value.trim();
    const hp      = document.getElementById('si-hp').value.trim();
    const resultEl = document.getElementById('single-result');

    if (!courier) return showToast('⚠️ Pilih kurir dulu!');
    if (!awb)     return showToast('⚠️ Masukkan nomor resi!');

    const btn = document.getElementById('btn-single-track');
    btn.textContent = '⏳ Mengecek...'; btn.disabled = true;
    resultEl.style.display = 'none';

    try {
        const res  = await fetch('/api/track', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ courier, awb, hp })
        });
        const data = await res.json();
        if (data.error) {
            resultEl.style.display = 'block';
            resultEl.innerHTML = `<div class="glass track-result-card" style="border-color:rgba(255,91,91,0.3)">
                <div style="color:var(--red);font-weight:600">❌ ${escapeHtml(data.error)}</div>
            </div>`;
        } else {
            renderSingleResult(resultEl, data, courier, awb);
        }
    } catch (e) {
        resultEl.style.display = 'block';
        resultEl.innerHTML = `<div class="glass track-result-card"><div style="color:var(--red)">❌ ${e.message}</div></div>`;
    } finally {
        btn.textContent = '🔍 Cek Sekarang'; btn.disabled = false;
    }
}

function renderSingleResult(el, data, courier, awb) {
    const s = data.summary || {};
    const d = data.detail  || {};
    const h = data.history || [];

    const statusLower = (s.status || '').toLowerCase();
    let icon = '📦', color = 'var(--blue)', label = s.status || '-';
    if (statusLower === 'delivered') { icon = '✅'; color = 'var(--green)'; label = 'DITERIMA'; }
    else if (statusLower === 'returned') { icon = '↩️'; color = 'var(--red)'; label = 'DIKEMBALIKAN'; }
    else if (statusLower.includes('process') || statusLower.includes('transit')) { icon = '🚚'; color = 'var(--yellow)'; label = 'DALAM PERJALANAN'; }

    const timeline = h.slice(0, 10).map((item, i) => `
        <div class="timeline-item">
            <div class="tl-dot ${i === 0 ? 'tl-first' : ''}"></div>
            <div class="tl-content">
                <div class="tl-date">${escapeHtml(item.date || '')}</div>
                <div class="tl-desc">${escapeHtml(item.desc || '')}</div>
            </div>
        </div>`).join('');

    el.style.display = 'block';
    el.innerHTML = `
    <div class="glass track-result-card" style="border-color:${color}33">
        <div class="track-status-row">
            <div class="track-status-icon">${icon}</div>
            <div class="track-status-text">
                <div class="status-main" style="color:${color}">${label}</div>
                <div class="status-sub">${courier.toUpperCase()} · ${awb}</div>
            </div>
        </div>
        <div class="track-meta">
            <div class="track-meta-item">
                <div class="lbl">Pengirim</div>
                <div class="val">${escapeHtml(d.shipper || '-')}</div>
            </div>
            <div class="track-meta-item">
                <div class="lbl">Penerima</div>
                <div class="val">${escapeHtml(maskName(d.receiver || '-'))}</div>
            </div>
            <div class="track-meta-item">
                <div class="lbl">Rute</div>
                <div class="val">${escapeHtml(d.origin || '-')} → ${escapeHtml(d.destination || '-')}</div>
            </div>
        </div>
        <div class="card-title" style="margin-bottom:12px">🕐 Riwayat Perjalanan</div>
        <div class="timeline">${timeline || '<p style="color:var(--sub);font-size:13px">Belum ada riwayat.</p>'}</div>
    </div>`;
}

function maskName(name) {
    return name.split(' ').map(w => w.length > 2 ? w.slice(0,2) + '*'.repeat(w.length-2) : w).join(' ');
}

// ── Bulk Track ────────────────────────────────────────────────────────────────

let bulkResults = [];

async function bulkTrack() {
    const lines = document.getElementById('bulk-input').value
        .split('\n').map(l => l.trim()).filter(Boolean);

    if (!lines.length) return showToast('⚠️ Isi resi dulu!');

    const btn    = document.getElementById('btn-bulk-track');
    const label  = document.getElementById('bulk-progress-label');
    const barWrap = document.getElementById('bulk-bar-wrap');
    const bar    = document.getElementById('bulk-bar');
    const tbody  = document.getElementById('bulk-tbody');
    const card   = document.getElementById('bulk-result-card');

    btn.disabled = true; btn.textContent = '⏳ Mengecek...';
    barWrap.style.display = 'block'; card.style.display = 'block';
    tbody.innerHTML = '';
    bulkResults = [];

    let ok = 0, fail = 0;

    for (let i = 0; i < lines.length; i++) {
        const parts   = lines[i].split(/\s+/);
        const courier = parts[0]?.toLowerCase();
        const awb     = parts[1] || '';
        const hp      = parts[2] || '';

        const pct = Math.round((i + 1) / lines.length * 100);
        bar.style.width = pct + '%';
        label.textContent = `${i+1} / ${lines.length} resi diproses...`;

        // Placeholder row loading
        const tr = document.createElement('tr');
        tr.id = `brow-${i}`;
        tr.innerHTML = `<td>${i+1}</td><td>${courier?.toUpperCase()}</td><td style="font-size:11px">${awb}</td>
            <td colspan="4" style="color:var(--sub)">⏳ Memeriksa...</td>`;
        tbody.appendChild(tr);

        try {
            const res  = await fetch('/api/track', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ courier, awb, hp })
            });
            const data = await res.json();

            if (data.error) {
                fail++;
                const row = { i: i+1, courier, awb, status: 'ERROR', desc: data.error, shipper: '-', receiver: '-', date: '-' };
                bulkResults.push(row);
                tr.innerHTML = buildBulkRow(row);
            } else {
                ok++;
                const s = data.summary || {};
                const d = data.detail  || {};
                const lastH = (data.history || [])[0] || {};
                const row = {
                    i: i+1, courier: courier?.toUpperCase(), awb,
                    status:   s.status || '-',
                    desc:     lastH.desc || '-',
                    shipper:  d.shipper  || '-',
                    receiver: maskName(d.receiver || '-'),
                    date:     lastH.date || '-',
                };
                bulkResults.push(row);
                tr.innerHTML = buildBulkRow(row);
            }
        } catch (e) {
            fail++;
            const row = { i: i+1, courier, awb, status: 'ERROR', desc: e.message, shipper: '-', receiver: '-', date: '-' };
            bulkResults.push(row);
            tr.innerHTML = buildBulkRow(row);
        }

        // Delay 1.5 detik antar request agar tidak kena limit API
        if (i < lines.length - 1) await new Promise(r => setTimeout(r, 1500));
    }

    label.textContent = `✅ Selesai: ${ok} berhasil, ${fail} gagal`;
    btn.disabled = false; btn.textContent = '🚀 Cek Semua Resi';
    document.getElementById('bulk-result-title').textContent = `Hasil: ${lines.length} Resi`;
    document.getElementById('bulk-summary-bar').innerHTML = `
        <span class="badge badge-green">✅ ${ok} Berhasil</span>
        <span class="badge badge-red">❌ ${fail} Gagal</span>`;
}

function buildBulkRow(r) {
    const statusLower = r.status.toLowerCase();
    const badgeCls = r.status === 'ERROR' ? 'badge-red'
        : statusLower === 'delivered'  ? 'badge-green'
        : statusLower === 'returned'   ? 'badge-red'
        : 'badge-blue';
    return `<td>${r.i}</td>
        <td>${escapeHtml(r.courier)}</td>
        <td style="font-size:11px;font-family:monospace">${escapeHtml(r.awb)}</td>
        <td><span class="badge ${badgeCls}">${escapeHtml(r.status)}</span></td>
        <td style="font-size:12px;max-width:200px">${escapeHtml(r.desc)}</td>
        <td style="font-size:12px">${escapeHtml(r.shipper)} → ${escapeHtml(r.receiver)}</td>
        <td style="font-size:11px;color:var(--sub)">${escapeHtml(r.date)}</td>`;
}

function exportBulkCSV() {
    const headers = ['No','Kurir','AWB','Status','Deskripsi Terakhir','Pengirim','Penerima','Tanggal Update'];
    const rows = bulkResults.map(r =>
        [r.i, r.courier, r.awb, r.status, r.desc, r.shipper, r.receiver, r.date]
        .map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')
    );
    const csv  = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `bulk_resi_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
}

// ── Modal: Tandai Terjual ───────────────────────────────────────────────────────

let _sellStockId = null;

function openSellModal(stockId, itemName) {
    _sellStockId = stockId;
    document.getElementById('sell-item-info').innerHTML =
        `💸 <strong>${escapeHtml(itemName)}</strong> <span style="color:var(--sub)">(ID: ${stockId})</span>`;
    document.getElementById('sell-harga').value   = '';
    document.getElementById('sell-pembeli').value = '';
    document.getElementById('sell-catatan').value = '';
    document.getElementById('sell-error').style.display = 'none';
    document.getElementById('modal-sell').classList.add('open');
    setTimeout(() => document.getElementById('sell-harga').focus(), 100);
}

function closeSellModal(e) {
    if (e && !e.target.classList.contains('modal-backdrop')) return;
    document.getElementById('modal-sell').classList.remove('open');
    _sellStockId = null;
}

async function submitSell() {
    const harga_jual = parseInt(document.getElementById('sell-harga').value) || 0;
    const pembeli    = document.getElementById('sell-pembeli').value.trim();
    const catatan    = document.getElementById('sell-catatan').value.trim();
    const errEl      = document.getElementById('sell-error');

    const btn = document.getElementById('btn-submit-sell');
    btn.textContent = '⏳ Menyimpan...'; btn.disabled = true;
    errEl.style.display = 'none';

    try {
        const res  = await fetch(`/api/stocks/${_sellStockId}/sell`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ harga_jual, pembeli, catatan })
        });
        const data = await res.json();
        if (data.ok) {
            showToast('💸 Stok berhasil ditandai terjual!');
            document.getElementById('modal-sell').classList.remove('open');
            loadStocks();
            loadOverviewStats();
        } else {
            errEl.textContent = `❌ ${data.error}`;
            errEl.style.display = 'block';
        }
    } catch (e) {
        errEl.textContent = `❌ Error: ${e.message}`;
        errEl.style.display = 'block';
    } finally {
        btn.textContent = '💸 Konfirmasi Terjual'; btn.disabled = false;
    }
}

socket.on('stockSold', (data) => {
    showToast(`💸 "${data.item_name}" terjual${data.harga_jual ? ' — Rp ' + data.harga_jual.toLocaleString('id-ID') : ''}!`);
    loadOverviewStats();
});

// ── Modal: Input Resi ────────────────────────────────────────────────────────────

let _resiStockId = null;

function openResiModal(stockId, itemName) {
    _resiStockId = stockId;
    document.getElementById('resi-item-info').innerHTML =
        `📦 <strong>${escapeHtml(itemName)}</strong> <span style="color:var(--sub)">(ID: ${stockId})</span>`;
    document.getElementById('resi-awb').value  = '';
    document.getElementById('resi-hp').value   = '';
    document.getElementById('resi-error').style.display = 'none';

    // Pre-fill jika sudah ada track
    const existing = stockTracks[stockId];
    if (existing) {
        document.getElementById('resi-courier').value = existing.courier || 'jnt';
        document.getElementById('resi-awb').value     = existing.awb    || '';
        document.getElementById('resi-hp').value      = existing.hp     || '';
    }

    document.getElementById('modal-add-resi').classList.add('open');
    setTimeout(() => document.getElementById('resi-awb').focus(), 100);
}

function closeResiModal(e) {
    if (e && !e.target.classList.contains('modal-backdrop')) return;
    document.getElementById('modal-add-resi').classList.remove('open');
    _resiStockId = null;
}

async function submitResi() {
    const courier = document.getElementById('resi-courier').value;
    const awb     = document.getElementById('resi-awb').value.trim();
    const hp      = document.getElementById('resi-hp').value.trim();
    const errEl   = document.getElementById('resi-error');

    if (!awb) { errEl.textContent = '⚠️ Isi nomor resi!'; errEl.style.display = 'block'; return; }

    const btn = document.getElementById('btn-submit-resi');
    btn.textContent = '⏳ Validasi ke server ekspedisi...'; btn.disabled = true;
    errEl.style.display = 'none';

    try {
        const res  = await fetch('/api/stocktracks/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stock_id: _resiStockId, courier, awb, hp })
        });
        const data = await res.json();
        if (data.error) {
            errEl.textContent = `❌ ${data.error}`;
            errEl.style.display = 'block';
        } else {
            const msg = data.initialStatus
                ? `✅ Resi disimpan! Status saat ini: ${data.initialStatus}`
                : `✅ Resi disimpan dan dipantau!`;
            showToast(msg);
            document.getElementById('modal-add-resi').classList.remove('open');
            loadStocks();
        }
    } catch (e) {
        errEl.textContent = `❌ Error: ${e.message}`;
        errEl.style.display = 'block';
    } finally {
        btn.textContent = '✅ Simpan & Pantau Resi'; btn.disabled = false;
    }
}

// ── Auto-Ready Notification ──────────────────────────────────────────────────────

socket.on('stockAutoReady', (data) => {
    showToast(`🎉 "${data.item_name}" sudah DELIVERED — status diubah ke Ready!`);
    appendConsole(`[AUTO-READY] ✅ ${data.item_name} (${data.courier?.toUpperCase()} ${data.awb}) → Ready`);
    // Refresh stok jika halaman stok sedang aktif
    if (document.getElementById('page-stocks').classList.contains('active')) {
        setTimeout(() => loadStocks(), 1000);
    }
});

// ── Boot ───────────────────────────────────────────────────────────────────────

init();
