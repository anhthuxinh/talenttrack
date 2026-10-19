(() => {
  'use strict';
  const GROUPS = [
    { id: 'teaching', label: 'Giảng dạy nội bộ', short: 'Giảng dạy', color: '#17a5a0' },
    { id: 'technical', label: 'Đào tạo chuyên môn', short: 'Chuyên môn', color: '#327c9d' },
    { id: 'innovation', label: 'Sáng kiến, giải pháp', short: 'Sáng kiến', color: '#d29b49' },
    { id: 'english', label: 'Tiếng Anh', short: 'Tiếng Anh', color: '#789aad' },
    { id: 'management', label: 'Quản lý, kỹ năng', short: 'Quản lý', color: '#557b85' },
  ];
  const STORAGE_KEY = 'talent-track-v1';
  const LEGACY_STORAGE_KEY = 'talent-track-preview-v1';
  const EMPTY_DATA = {
    version: 1,
    source: '',
    targets: { teaching: 2, technical: 3, innovation: 2, english: 2, management: 12 },
    people: [],
    mentoring: [],
    sheets: [],
  };
  const PAF_PERIODS = ['10/2025', '11/2025', '12/2025', ...Array.from({ length: 12 }, (_, i) => `${String(i + 1).padStart(2, '0')}/2026`)];
  const MENTOR_PERIODS = ['11/2025', '12/2025', ...Array.from({ length: 10 }, (_, i) => `${String(i + 1).padStart(2, '0')}/2026`)];
  const main = document.querySelector('#main');
  const dialog = document.querySelector('#record-dialog');
  const pafDialog = document.querySelector('#paf-dialog');
  const mentorDialog = document.querySelector('#mentor-dialog');
  let data = loadData();
  let page = 'dashboard';
  let selectedId = null;
  let search = '';
  let filter = 'all';
  let mentorMonth = 'all';
  let recordGroup = 'all';
  let recordStatus = 'all';
  let editingRecordId = null;
  let editingMentorId = null;
  let toastTimer;

  function loadData() {
    if (window.TALENT_REMOTE) return validData(window.TALENT_SEED) ? structuredClone(window.TALENT_SEED) : structuredClone(EMPTY_DATA);
    for (const key of [STORAGE_KEY, LEGACY_STORAGE_KEY]) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const saved = JSON.parse(raw);
        if (validData(saved)) return saved;
      } catch (_) { /* Browser storage may be disabled or this entry may be invalid. */ }
    }
    return validData(window.TALENT_SEED) ? structuredClone(window.TALENT_SEED) : structuredClone(EMPTY_DATA);
  }

  function validData(value) {
    const safeId = id => typeof id === 'string' && /^[A-Za-z0-9_-]+$/.test(id);
    return value?.version === 1
      && typeof value.source === 'string'
      && GROUPS.every(group => Number.isFinite(value.targets?.[group.id]) && value.targets[group.id] > 0)
      && Array.isArray(value.people)
      && value.people.every(person => safeId(person.id) && typeof person.name === 'string'
        && typeof person.unit === 'string' && Array.isArray(person.records)
        && person.records.every(record => safeId(record.id) && typeof record.title === 'string'
          && ['done', 'planned'].includes(record.status) && GROUPS.some(group => group.id === record.group))
        && Array.isArray(person.paf) && person.paf.every(item => typeof item.period === 'string'
          && typeof item.grade === 'string' && (item.score === '' || Number.isFinite(item.score))))
      && new Set(value.people.map(person => person.id)).size === value.people.length
      && Array.isArray(value.mentoring)
      && value.mentoring.every(item => safeId(item.id) && typeof item.topic === 'string'
        && typeof item.mentor === 'string' && typeof item.role === 'string'
        && Array.isArray(item.sessions) && item.sessions.every(session => typeof session.period === 'string' && typeof session.schedule === 'string'));
  }

  function saveData() {
    if (window.TALENT_REMOTE) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
    catch (_) { toast('Trình duyệt không cho phép lưu. Hãy xuất bản sao dữ liệu.'); }
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  function initials(name) {
    return name.trim().split(/\s+/).slice(-2).map(part => part[0]).join('').toUpperCase();
  }

  function goal(person, id) {
    const target = data.targets[id];
    const count = person.records.filter(r => r.group === id && r.status === 'done').length;
    return { count, target, missing: Math.max(0, target - count), ratio: Math.min(1, count / target) };
  }

  function progress(person) {
    if (person.leave) return null;
    return GROUPS.slice(0, 4).reduce((sum, g) => sum + goal(person, g.id).ratio, 0) / 4;
  }

  function percent(value) { return value === null ? '—' : `${Math.round(value * 100)}%`; }

  function status(person) {
    if (person.leave) return { text: 'Thai sản', cls: 'leave' };
    const value = progress(person);
    if (value === 1) return { text: 'Hoàn thành', cls: 'done' };
    if (value >= .75) return { text: 'Gần hoàn thành', cls: 'good' };
    if (value >= .5) return { text: 'Đang tiến triển', cls: 'mid' };
    return { text: 'Cần ưu tiên', cls: 'low' };
  }

  function summary() {
    const tracked = data.people.filter(p => !p.leave);
    return {
      tracked: tracked.length,
      leave: data.people.length - tracked.length,
      done: tracked.filter(p => progress(p) === 1).length,
      low: tracked.filter(p => progress(p) < .5).length,
      average: tracked.reduce((sum, p) => sum + progress(p), 0) / (tracked.length || 1),
    };
  }

  function planCoverage(person) {
    return GROUPS.slice(0, 4).every(g =>
      person.records.filter(r => r.group === g.id && ['done', 'planned'].includes(r.status)).length >= data.targets[g.id]);
  }

  function attentionPeople() {
    return data.people.filter(p => !p.leave && progress(p) < .5)
      .sort((a, b) => progress(a) - progress(b) || a.name.localeCompare(b.name, 'vi'));
  }

  function toast(message) {
    const box = document.querySelector('#toast');
    box.textContent = message;
    box.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => box.classList.remove('show'), 3000);
  }

  function heading(title, description, label = 'TỔNG HỢP TIẾN ĐỘ') {
    return `<div class="page-heading"><div><p class="eyebrow">${label}</p><h1>${title}</h1><p>${description}</p></div><span class="heading-note">Tỷ lệ tổng: trung bình 4 nhóm mục tiêu, mỗi nhóm tối đa 100%</span></div>`;
  }

  function peopleRows(people) {
    if (!people.length) return '<tr><td colspan="6" class="empty">Không tìm thấy nhân sự phù hợp.</td></tr>';
    return people.map(person => {
      const value = progress(person), st = status(person);
      const missing = person.leave ? 'Tạm tách khỏi thống kê' : GROUPS.slice(0, 4).filter(g => goal(person, g.id).missing).map(g => `${g.short} ${goal(person, g.id).missing}`).join(' · ') || 'Đã đủ tất cả mục tiêu';
      return `<tr class="person-row" data-person="${person.id}" tabindex="0" aria-label="Xem hồ sơ ${escapeHtml(person.name)}">
        <td><div class="person-cell"><span class="avatar">${escapeHtml(initials(person.name))}</span><span><strong>${escapeHtml(person.name)}</strong><small>${escapeHtml(person.unit || 'Chưa có đơn vị')}</small></span></div></td>
        <td><div class="progress-cell"><strong>${percent(value)}</strong><span class="mini-track"><span style="width:${Math.round((value || 0) * 100)}%"></span></span></div></td>
        <td>${person.leave ? '—' : `${GROUPS.slice(0, 4).filter(g => goal(person, g.id).missing === 0).length}/4 nhóm`}</td>
        <td><span class="missing">${escapeHtml(missing)}</span></td>
        <td><span class="badge ${st.cls}">${st.text}</span></td><td style="color:#14805c;font-weight:800">Xem →</td></tr>`;
    }).join('');
  }

  function peopleTable(people) {
    return `<div class="panel table-wrap"><table class="people-table"><thead><tr><th>NHÂN SỰ</th><th>TIẾN ĐỘ</th><th>ĐÃ ĐẠT</th><th>CÒN THIẾU</th><th>TRẠNG THÁI</th><th></th></tr></thead><tbody>${peopleRows(people)}</tbody></table></div>`;
  }

  function filteredPeople() {
    const term = search.trim().toLocaleLowerCase('vi');
    return data.people.filter(p => {
      const match = !term || `${p.name} ${p.unit}`.toLocaleLowerCase('vi').includes(term);
      const st = status(p);
      return match && (filter === 'all' || (filter === 'attention' ? !p.leave && progress(p) < .5 : filter === st.cls));
    }).sort((a, b) => {
      if (a.leave !== b.leave) return a.leave ? 1 : -1;
      return (progress(a) ?? 2) - (progress(b) ?? 2) || a.name.localeCompare(b.name, 'vi');
    });
  }

  function mentoringView() {
    const topics = data.mentoring || [];
    const today = bangkokDate();
    const events = topics.flatMap(topic => topic.sessions.map(session => ({ topic, session, date: session.sessionDate || mentorDate(session.schedule) })));
    events.sort((a, b) => {
      const distance = date => date ? Math.abs(Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) : Infinity;
      return distance(a.date) - distance(b.date) || (b.date || '').localeCompare(a.date || '') || a.topic.topic.localeCompare(b.topic.topic, 'vi');
    });
    const months = [...new Set(events.map(event => event.date?.slice(0, 7)).filter(Boolean))].sort().reverse();
    if (mentorMonth !== 'all' && !months.includes(mentorMonth)) mentorMonth = 'all';
    const visible = mentorMonth === 'all' ? events : events.filter(event => event.date?.startsWith(mentorMonth));
    const noSchedule = mentorMonth === 'all' ? topics.filter(topic => !topic.sessions.length) : [];
    const monthOptions = months.map(month => `<option value="${month}">Tháng ${month.slice(5)}/${month.slice(0, 4)}</option>`).join('');
    const rows = visible.map(({ topic, session, date }) => {
      const state = !date ? { text: 'Chưa rõ ngày', cls: 'unknown' } : date < today ? { text: 'Đã thực hiện', cls: 'done' } : date === today ? { text: 'Hôm nay', cls: 'today' } : { text: 'Sắp diễn ra', cls: 'upcoming' };
      return `<div class="mentor-event"><div class="mentor-date"><strong>${date ? date.slice(8, 10) : '—'}</strong><small>${date ? `${date.slice(5, 7)}/${date.slice(0, 4)}` : session.period}</small></div><div class="mentor-event-copy"><strong>${escapeHtml(topic.topic)}</strong><span>Hướng dẫn: <b>${escapeHtml(topic.mentor || 'Chưa ghi')}</b>${topic.role ? ` · ${escapeHtml(topic.role)}` : ''}</span><small>${escapeHtml(session.schedule)}</small><span class="mentor-status ${state.cls}">${state.text}</span></div><button class="icon-button" data-edit-mentor="${escapeHtml(topic.id)}" aria-label="Sửa chủ đề ${escapeHtml(topic.topic)}" title="Sửa chủ đề và lịch">✎</button></div>`;
    }).join('');
    const undatedRows = noSchedule.map(topic => `<div class="mentor-event"><div class="mentor-date"><strong>—</strong><small>Chưa có lịch</small></div><div class="mentor-event-copy"><strong>${escapeHtml(topic.topic)}</strong><span>Hướng dẫn: <b>${escapeHtml(topic.mentor || 'Chưa ghi')}</b></span></div><button class="icon-button" data-edit-mentor="${escapeHtml(topic.id)}" aria-label="Sửa chủ đề ${escapeHtml(topic.topic)}" title="Sửa chủ đề và lịch">✎</button></div>`).join('');
    return `<div class="main-content"><div class="page-heading"><div><p class="eyebrow">CHƯƠNG TRÌNH NHÂN VIÊN TÀI NĂNG</p><h1>Hướng dẫn, chia sẻ, kèm cặp</h1><p>Tra cứu theo tháng để xem lãnh đạo hướng dẫn, chủ đề và các buổi đã thực hiện.</p></div></div><section class="panel mentoring-panel"><div class="panel-head"><div><p class="eyebrow">LỊCH CHUNG</p><h2>Các buổi theo thời gian</h2><p>${topics.length} chủ đề · ${events.length} mục lịch. Buổi gần thời điểm hiện tại nhất hiển thị trước.</p></div><button class="button ghost" data-add-mentor="true">+ Thêm chủ đề</button></div><div class="mentor-toolbar"><label for="mentor-month">Xem theo tháng</label><select class="select" id="mentor-month"><option value="all">Tất cả các tháng</option>${monthOptions}</select><span>${visible.filter(event => event.date && event.date < today).length} đã thực hiện · ${visible.length} mục lịch · ${new Set(visible.map(event => event.topic.id)).size} chủ đề</span></div><div class="mentor-timeline">${rows}${undatedRows || ''}${!visible.length && !undatedRows ? '<p class="empty">Không có buổi hướng dẫn trong tháng này.</p>' : ''}</div><p class="source-note">“Đã thực hiện” được suy ra khi ngày ghi trong lịch đã qua, chưa có cột xác nhận riêng trong Excel. Bộ lọc dùng ngày thực tế trong nội dung lịch; một số ngày khác tháng ở tiêu đề cột. Lịch này chưa gắn với hồ sơ từng nhân sự.</p></section></div>`;
  }

  function bangkokDate() {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map(part => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  function mentorDate(schedule) {
    const match = String(schedule || '').match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
    if (!match) return null;
    const day = Number(match[1]), month = Number(match[2]), year = Number(match[3]);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
      ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : null;
  }

  function pafView(person) {
    const history = person.paf || [];
    const values = history.filter(item => typeof item.score === 'number');
    const average = values.length ? values.reduce((sum, item) => sum + item.score, 0) / values.length : null;
    const averageGrade = average === null ? '—' : average <= 79.49 ? 'HT' : average <= 89.49 ? 'HTT' : 'HTXS';
    const byPeriod = new Map(history.map(item => [item.period, item]));
    return `<section class="panel paf-panel"><div class="panel-head"><div><p class="eyebrow">ĐÁNH GIÁ MĐHTCV</p><h2>Điểm và xếp loại theo tháng</h2><p>Chỉ hiển thị trong hồ sơ cá nhân. Điểm đánh giá không cộng vào tiến độ 4 nhóm mục tiêu.</p></div><button class="button ghost" data-edit-paf="true">Cập nhật đánh giá</button></div><div class="paf-summary"><span><small>ĐIỂM BÌNH QUÂN CÁC THÁNG CÓ ĐIỂM</small><strong>${average === null ? '—' : average.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}</strong></span><span><small>XẾP LOẠI THEO ĐIỂM BÌNH QUÂN</small><strong>${averageGrade}</strong></span></div><p class="paf-rule">Ngưỡng xếp loại: đến 79,49 · HT; trên 79,49 đến 89,49 · HTT; trên 89,49 · HTXS.</p><div class="paf-grid">${PAF_PERIODS.map(period => {
      const item = byPeriod.get(period);
      return `<div class="paf-month ${item ? '' : 'muted'}"><small>${period}</small><strong>${escapeHtml(item?.score ?? '—')}</strong><span>${escapeHtml(item?.grade || 'Chưa có dữ liệu')}</span></div>`;
    }).join('')}</div></section>`;
  }

  function dashboardView() {
    const s = summary();
    const active = data.people.filter(p => !p.leave);
    const priority = attentionPeople();
    const managementDone = data.people.filter(p => goal(p, 'management').missing === 0).length;
    const planDone = active.filter(planCoverage).length;
    const groupRows = GROUPS.slice(0, 4).map(g => {
      const done = active.filter(p => goal(p, g.id).missing === 0).length;
      const ratio = done / (active.length || 1);
      return `<div class="group-row"><div class="group-label"><span>${g.label}</span><span>${done}/${active.length} người đạt đủ</span></div><div class="track"><span style="width:${Math.round(ratio * 100)}%;background:${g.color}"></span></div></div>`;
    }).join('');
    return `<div class="main-content">
      <section class="program-hero" aria-label="Tổng quan chương trình">
        <div class="hero-copy"><p class="eyebrow">TRẠM ĐIỀU HÀNH NĂNG LỰC · PVEP</p><h1>Tổng quan chương trình</h1><p>Theo dõi bức tranh chung của chương trình nhân viên tài năng và tập trung vào những người cần hỗ trợ.</p><button class="hero-link" data-page="people">Xem tiến độ ${data.people.length} nhân sự <span aria-hidden="true">↗</span></button></div>
        <svg class="rig-art" viewBox="0 0 390 210" fill="none" aria-hidden="true"><path d="M4 184H390M24 197H390" stroke="#79A2AD" stroke-opacity=".42"/><path d="M126 184L188 18L251 184M148 126H229M161 91H216M173 57H203M135 157H242" stroke="#B6C6C3" stroke-width="4"/><path d="M188 18V2M182 9H194M184 31H192M150 184V157M226 184V157" stroke="#D3B07B" stroke-width="4"/><path d="M55 184V132H108V184M282 184V105H349V184M293 105V76H337V105M322 76V57M285 142H349M73 132V108H92V132" stroke="#82A5AB" stroke-width="4"/><path d="M14 184C31 168 38 168 55 184M251 184C266 167 271 167 282 184M349 184C363 169 373 169 390 184" stroke="#D3B07B" stroke-width="3"/><circle cx="322" cy="50" r="5" fill="#E1AF62"/></svg>
      </section>
      <div class="metric-grid">
        <div class="metric-card blue"><div class="icon">◫</div><strong>${data.people.length}</strong><span>Nhân sự trong chương trình</span><small>${s.tracked} đang theo dõi · ${s.leave} thai sản</small></div>
        <div class="metric-card"><div class="icon">◫</div><strong>${s.tracked}</strong><span>Nhân sự đang theo dõi</span><small>${s.leave} trường hợp thai sản</small></div>
        <div class="metric-card"><div class="icon">✓</div><strong>${s.done}</strong><span>Đạt đủ 4 nhóm mục tiêu</span><small>Trong ${s.tracked} nhân sự đang theo dõi</small></div>
        <div class="metric-card amber"><div class="icon">◔</div><strong>${percent(s.average)}</strong><span>Tiến độ bình quân</span><small>Trung bình 4 nhóm mục tiêu</small></div>
      </div>
      <section class="panel group-panel"><div class="panel-head"><div><p class="eyebrow">TIẾN ĐỘ CHƯƠNG TRÌNH</p><h2>Hoàn thành theo nhóm mục tiêu</h2><p>Số người đạt đủ từng nhóm trong ${s.tracked} nhân sự đang theo dõi</p></div></div><div class="group-list">${groupRows}</div></section>
      <div class="secondary-overview"><section class="panel mini-overview"><p class="eyebrow">QUẢN LÝ · KỸ NĂNG</p><h2>${managementDone}/${data.people.length} người</h2><p>Đã đủ 12 khóa. Theo dõi riêng với tiến độ 4 nhóm.</p><div class="track"><span style="width:${Math.round(managementDone / data.people.length * 100)}%"></span></div></section><section class="panel mini-overview"><p class="eyebrow">Đã có kế hoạch đủ 4 nhóm mục tiêu</p><h2>${planDone}/${s.tracked} người</h2><p>Đã hoàn thành hoặc có kế hoạch đủ số lượng cho cả 4 nhóm mục tiêu.</p><div class="track"><span style="width:${Math.round(planDone / s.tracked * 100)}%"></span></div></section></div>
      <section class="panel attention-panel"><div class="panel-head"><div><p class="eyebrow">NHÂN SỰ LƯU Ý</p><h2>Nhân sự đáng lưu ý <span class="attention-count">${priority.length}</span></h2><p>Chỉ hiển thị nhân sự có tiến độ dưới 50%. Bấm vào một người để xem chi tiết phần còn thiếu.</p></div><button class="text-link" data-page="people" data-attention="true">Mở danh sách ưu tiên →</button></div>
        <div class="attention-grid">${priority.length ? priority.map(p => {
          const missing = GROUPS.slice(0, 4).filter(g => goal(p, g.id).missing > 0);
          return `<button class="attention-card" data-person="${p.id}"><span class="avatar">${escapeHtml(initials(p.name))}</span><span class="attention-copy"><strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(p.unit || 'Chưa có đơn vị')} · Đạt ${4 - missing.length}/4 nhóm mục tiêu</small></span><span class="attention-progress">${percent(progress(p))}</span><span class="attention-arrow" aria-hidden="true">↗</span></button>`;
        }).join('') : '<p class="empty">Hiện không có nhân sự nào dưới 50%.</p>'}</div>
      </section>
      </div>`;
  }

  function peopleView() {
    return `<div class="main-content">${heading('Tiến độ ' + data.people.length + ' nhân sự', 'Chọn một người để xem đã hoàn thành gì, còn thiếu gì và kế hoạch tiếp theo.', 'THEO DÕI CÁ NHÂN')}
      <div class="people-summary-strip"><span><strong>${data.people.length}</strong> nhân sự trong chương trình</span><span><strong>${summary().tracked}</strong> đang theo dõi</span><span><strong>${summary().leave}</strong> thai sản</span><span><strong>${summary().low}</strong> dưới 50%</span></div>
      <div class="section-title"><h2>${filteredPeople().length} nhân sự</h2><div class="filters"><input class="search" id="people-search" type="search" placeholder="Tìm theo tên hoặc đơn vị…" value="${escapeHtml(search)}" aria-label="Tìm nhân sự"><select class="select" id="people-filter" aria-label="Lọc trạng thái"><option value="all">Tất cả trạng thái</option><option value="attention">Nhân sự đáng lưu ý (&lt;50%)</option><option value="mid">Đang tiến triển</option><option value="good">Gần hoàn thành</option><option value="done">Hoàn thành</option><option value="leave">Thai sản</option></select></div></div>
      <div id="people-table-region">${peopleTable(filteredPeople())}</div></div>`;
  }

  function recordsView(person) {
    const records = person.records.filter(r => (recordGroup === 'all' || r.group === recordGroup) && (recordStatus === 'all' || r.status === recordStatus));
    records.sort((a, b) => (a.status === b.status ? GROUPS.findIndex(g => g.id === a.group) - GROUPS.findIndex(g => g.id === b.group) : a.status === 'planned' ? -1 : 1));
    if (!records.length) return '<div class="empty">Chưa có nội dung nào trong bộ lọc này.</div>';
    return records.map(r => `<div class="record-row"><span class="status-dot ${r.status}"></span><span class="record-copy"><strong>${escapeHtml(r.title)}</strong><small>${escapeHtml(GROUPS.find(g => g.id === r.group)?.label || r.group)} · ${r.status === 'done' ? 'Đã hoàn thành' : 'Có kế hoạch'}${r.when ? ' · ' + escapeHtml(r.when) : ''}</small>${r.note ? `<em>${escapeHtml(r.note)}</em>` : ''}${r.score ? `<em>Kết quả: ${escapeHtml(r.score)}</em>` : ''}</span><span class="record-actions">${r.status === 'planned' ? `<button class="icon-button" data-complete="${escapeHtml(r.id)}" title="Đánh dấu hoàn thành" aria-label="Đánh dấu hoàn thành ${escapeHtml(r.title)}">✓</button>` : ''}<button class="icon-button" data-edit="${escapeHtml(r.id)}" title="Sửa nội dung" aria-label="Sửa ${escapeHtml(r.title)}">✎</button></span></div>`).join('');
  }

  function detailView() {
    const person = data.people.find(p => p.id === selectedId);
    if (!person) { selectedId = null; return peopleView(); }
    const value = progress(person);
    const goals = GROUPS.slice(0, 4).map(g => {
      const x = goal(person, g.id);
      return `<div class="goal-card"><small>${g.label}</small><strong>${x.count}<span style="font-size:12px;color:#9caeb5"> / ${x.target}</span></strong><div class="track"><span style="width:${Math.round(x.ratio * 100)}%;background:${g.color}"></span></div></div>`;
    }).join('');
    const completedGroups = GROUPS.slice(0, 4).filter(g => goal(person, g.id).missing === 0).length;
    const goalRows = GROUPS.slice(0, 4).map(g => {
      const x = goal(person, g.id);
      return `<div class="need-row"><span>${g.label}</span><strong>${Math.min(x.count, x.target)}/${x.target}</strong></div>`;
    }).join('');
    const mgmt = goal(person, 'management');
    return `<div class="main-content"><button class="detail-back" data-back="people">← Quay lại danh sách</button>
      <div class="detail-layout"><div><section class="panel"><div class="profile-head"><span class="profile-avatar">${escapeHtml(initials(person.name))}</span><div><h2>${escapeHtml(person.name)}</h2><p>${escapeHtml(person.unit || 'Chưa có đơn vị')} · <span class="badge ${status(person).cls}">${status(person).text}</span></p></div></div>
        <div class="profile-overview"><div class="big-progress"><div class="ring" style="--angle:${Math.round((value || 0) * 100)}%"><span>${percent(value)}</span></div><div><strong>Tiến độ 4 nhóm mục tiêu</strong><p>${person.leave ? 'Tạm tách khỏi thống kê chung trong thời gian thai sản.' : 'Mỗi nhóm đóng góp 25% vào tỷ lệ tổng. Số nội dung vượt chỉ tiêu không làm tỷ lệ vượt 100%.'}</p></div></div><div class="goal-grid">${goals}</div></div>
        <div class="management-block"><h3>Quản lý và kỹ năng: ${mgmt.count}/${mgmt.target} khóa</h3><p>Theo dõi riêng, không cộng vào tỷ lệ tổng 4 nhóm.</p><div class="track"><span style="width:${Math.round(mgmt.ratio * 100)}%"></span></div></div></section>
        ${pafView(person)}
        <section class="panel" style="margin-top:18px"><div class="record-toolbar"><h2>Nội dung chi tiết (${person.records.length})</h2><button class="button primary" data-add="${person.id}">+ Thêm nội dung</button></div><div class="filters" style="padding:14px 23px"><select class="select" id="record-group"><option value="all">Tất cả nhóm</option>${GROUPS.map(g => `<option value="${g.id}">${g.label}</option>`).join('')}</select><select class="select" id="record-status"><option value="all">Mọi trạng thái</option><option value="planned">Có kế hoạch</option><option value="done">Đã hoàn thành</option></select></div><div class="record-list" id="record-list">${recordsView(person)}</div></section></div>
        <aside><section class="panel side-panel"><h3>Tiến độ thực hiện mục tiêu <span class="goal-count">${completedGroups}/4</span></h3>${goalRows}<p class="section-subtitle" style="margin-top:14px">Mỗi dòng thể hiện số nội dung đã hoàn thành trên chỉ tiêu của nhóm. Bấm “Thêm nội dung” hoặc dấu ✓ bên kế hoạch để cập nhật.</p></section><section class="panel side-panel" style="margin-top:18px"><h3>Quy tắc đánh giá</h3><p class="section-subtitle">Giảng dạy 2 · Chuyên môn 3 · Sáng kiến 2 · Tiếng Anh 2. Mỗi nhóm chiếm 25% của tiến độ tổng. Dữ liệu gốc: ${escapeHtml(data.source)}.</p></section></aside></div></div>`;
  }

  function render() {
    const online = !!window.TALENT_REMOTE;
    document.body.classList.toggle('read-only', online && !window.TALENT_CAN_EDIT);
    const hasExcelSource = validData(window.TALENT_SEED) && window.TALENT_SEED.people.length > 0;
    document.querySelector('#source-label').textContent = online ? 'Supabase · dữ liệu chung' : hasExcelSource ? 'Excel 2025–2026' : data.people.length ? 'Dữ liệu trên thiết bị' : 'Chưa kết nối';
    document.querySelector('#source-count').textContent = data.people.length
      ? online ? `${data.people.length} nhân sự · ${summary().leave} thai sản` : `${data.sheets?.length || 0} sheet · ${data.people.length} nhân sự · ${summary().leave} thai sản`
      : 'Chưa kết nối dữ liệu';
    document.querySelector('#source-badge').textContent = online ? 'SUPABASE' : hasExcelSource ? 'NGUỒN EXCEL' : data.people.length ? 'DỮ LIỆU CỤC BỘ' : 'CHƯA KẾT NỐI';
    document.querySelector('#reset-data').hidden = online || !hasExcelSource;
    document.querySelector('#import-button').hidden = online || !data.people.length;
    document.querySelector('#export-button').disabled = !data.people.length;
    document.querySelector('#page-title').textContent = selectedId ? 'Hồ sơ nhân sự' : page === 'dashboard' ? 'Tổng quan chương trình' : page === 'people' ? 'Tiến độ nhân sự' : 'Hướng dẫn, chia sẻ, kèm cặp';
    document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.page === page));
    if (!data.people.length) {
      main.innerHTML = `<div class="main-content"><section class="panel data-start"><p class="eyebrow">NGUỒN DỮ LIỆU</p><h1>Chưa kết nối dữ liệu chương trình</h1><p>Dữ liệu Excel đang được chuẩn bị để kết nối với trang. Khi nguồn dữ liệu được cấu hình, tiến độ nhân sự và lịch hướng dẫn sẽ hiển thị tại đây.</p></section></div>`;
      return;
    }
    main.innerHTML = selectedId ? detailView() : page === 'dashboard' ? dashboardView() : page === 'people' ? peopleView() : mentoringView();
    if (main.querySelector('#people-filter')) main.querySelector('#people-filter').value = filter;
    if (main.querySelector('#record-group')) main.querySelector('#record-group').value = recordGroup;
    if (main.querySelector('#record-status')) main.querySelector('#record-status').value = recordStatus;
    if (main.querySelector('#mentor-month')) main.querySelector('#mentor-month').value = mentorMonth;
  }

  function openRecord(id = null) {
    const person = data.people.find(p => p.id === selectedId);
    if (!person) return;
    const record = person.records.find(r => r.id === id);
    editingRecordId = record?.id || null;
    document.querySelector('#dialog-title').textContent = record ? 'Sửa nội dung' : 'Thêm nội dung';
    document.querySelector('#field-group').innerHTML = GROUPS.map(g => `<option value="${g.id}">${g.label}</option>`).join('');
    document.querySelector('#field-group').value = record?.group || 'technical';
    document.querySelector('#field-status').value = record?.status || 'planned';
    document.querySelector('#field-title').value = record?.title || '';
    document.querySelector('#field-when').value = record?.when || '';
    document.querySelector('#field-score').value = record?.score || '';
    document.querySelector('#field-note').value = record?.note || '';
    document.querySelector('#delete-record').hidden = !record || !!window.TALENT_REMOTE;
    dialog.showModal();
    document.querySelector('#field-title').focus();
  }

  function closeRecord() { dialog.close(); editingRecordId = null; }

  function fillPaf(period) {
    const person = data.people.find(p => p.id === selectedId);
    const item = person?.paf?.find(entry => entry.period === period);
    document.querySelector('#paf-score').value = item?.score ?? '';
    document.querySelector('#paf-grade').value = item?.grade || '';
  }

  function openPaf() {
    const person = data.people.find(p => p.id === selectedId);
    if (!person) return;
    const select = document.querySelector('#paf-period');
    select.innerHTML = PAF_PERIODS.map(period => `<option value="${period}">${period}</option>`).join('');
    select.value = person.paf?.at(-1)?.period || PAF_PERIODS[0];
    fillPaf(select.value);
    pafDialog.showModal();
  }

  function openMentor(id = null) {
    const item = data.mentoring?.find(topic => topic.id === id);
    editingMentorId = item?.id || null;
    document.querySelector('#mentor-dialog-title').textContent = item ? 'Cập nhật chủ đề' : 'Thêm chủ đề hướng dẫn';
    document.querySelector('#mentor-topic').value = item?.topic || '';
    document.querySelector('#mentor-name').value = item?.mentor || '';
    document.querySelector('#mentor-role').value = item?.role || '';
    document.querySelector('#mentor-period-fields').innerHTML = MENTOR_PERIODS.map(period => {
      const session = item?.sessions.find(entry => entry.period === period);
      return `<label>${period}<textarea data-mentor-period="${period}" rows="2" maxlength="300" placeholder="Ngày, giờ thực tế">${escapeHtml(session?.schedule || '')}</textarea></label>`;
    }).join('');
    document.querySelector('#delete-mentor').hidden = !item || !!window.TALENT_REMOTE;
    mentorDialog.showModal();
    document.querySelector('#mentor-topic').focus();
  }

  document.addEventListener('click', async event => {
    const target = event.target.closest('[data-page],[data-person],[data-back],[data-add],[data-edit],[data-complete],[data-edit-paf],[data-edit-mentor],[data-add-mentor],[data-close-dialog]');
    if (!target) return;
    if (target.dataset.closeDialog === 'paf') pafDialog.close();
    else if (target.dataset.closeDialog === 'mentor') mentorDialog.close();
    else if (target.dataset.page) { page = target.dataset.page; selectedId = null; if (page === 'people') filter = target.dataset.attention ? 'attention' : 'all'; render(); window.scrollTo(0, 0); }
    else if (target.dataset.back) { selectedId = null; page = 'people'; render(); }
    else if (target.dataset.person) { selectedId = target.dataset.person; page = 'people'; recordGroup = 'all'; recordStatus = 'all'; render(); window.scrollTo(0, 0); }
    else if (target.dataset.add) openRecord();
    else if (target.dataset.edit) openRecord(target.dataset.edit);
    else if (target.dataset.editPaf) openPaf();
    else if (target.dataset.editMentor) openMentor(target.dataset.editMentor);
    else if (target.dataset.addMentor) openMentor();
    else if (target.dataset.complete) {
      const person = data.people.find(p => p.id === selectedId);
      const record = person?.records.find(r => r.id === target.dataset.complete);
      if (record?.title === 'Chưa xác định nội dung cụ thể') { openRecord(record.id); toast('Hãy ghi rõ nội dung trước khi đánh dấu hoàn thành.'); }
      else if (record) {
        try {
          if (window.TALENT_REMOTE) await window.TALENT_REMOTE.completeRecord(record.id);
          record.status = 'done'; saveData(); render(); toast('Đã cập nhật trạng thái hoàn thành.');
        } catch (error) { toast(`Không lưu được: ${error.message}`); }
      }
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Enter' && event.target.matches('tr[data-person]')) event.target.click();
  });

  main.addEventListener('input', event => {
    if (event.target.id !== 'people-search') return;
    search = event.target.value;
    const people = filteredPeople();
    main.querySelector('.section-title h2').textContent = `${people.length} nhân sự`;
    main.querySelector('#people-table-region').innerHTML = peopleTable(people);
  });

  main.addEventListener('change', event => {
    if (event.target.id === 'mentor-month') { mentorMonth = event.target.value; render(); }
    if (event.target.id === 'people-filter') { filter = event.target.value; render(); }
    if (event.target.id === 'record-group') { recordGroup = event.target.value; main.querySelector('#record-list').innerHTML = recordsView(data.people.find(p => p.id === selectedId)); }
    if (event.target.id === 'record-status') { recordStatus = event.target.value; main.querySelector('#record-list').innerHTML = recordsView(data.people.find(p => p.id === selectedId)); }
  });

  document.querySelector('#paf-period').addEventListener('change', event => fillPaf(event.target.value));
  document.querySelector('#paf-form').addEventListener('submit', async event => {
    event.preventDefault();
    const person = data.people.find(p => p.id === selectedId);
    if (!person) return;
    const period = document.querySelector('#paf-period').value;
    const rawScore = document.querySelector('#paf-score').value.trim();
    const grade = document.querySelector('#paf-grade').value;
    const score = rawScore === '' ? '' : Number(rawScore);
    if (rawScore !== '' && (!Number.isFinite(score) || score < 0 || score > 100)) return;
    try { if (window.TALENT_REMOTE) await window.TALENT_REMOTE.savePaf(person.id, period, score, grade); }
    catch (error) { toast(`Không lưu được: ${error.message}`); return; }
    person.paf ||= [];
    person.paf = person.paf.filter(item => item.period !== period);
    if (rawScore !== '' || grade) person.paf.push({ period, score, grade });
    person.paf.sort((a, b) => PAF_PERIODS.indexOf(a.period) - PAF_PERIODS.indexOf(b.period));
    saveData(); pafDialog.close(); render(); toast('Đã cập nhật đánh giá MĐHTCV.');
  });

  document.querySelector('#mentor-form').addEventListener('submit', async event => {
    event.preventDefault();
    const topic = document.querySelector('#mentor-topic').value.trim();
    if (!topic) return;
    const item = {
      id: editingMentorId || `mentor-new-${crypto.randomUUID()}`,
      topic,
      mentor: document.querySelector('#mentor-name').value.trim(),
      role: document.querySelector('#mentor-role').value.trim(),
      sessions: [...document.querySelectorAll('[data-mentor-period]')].map(field => ({ period: field.dataset.mentorPeriod, schedule: field.value.trim() })).filter(entry => entry.schedule),
    };
    data.mentoring ||= [];
    const index = data.mentoring.findIndex(entry => entry.id === editingMentorId);
    try { if (window.TALENT_REMOTE) await window.TALENT_REMOTE.saveMentor(item, index >= 0 ? data.mentoring[index] : null); }
    catch (error) { toast(`Không lưu được: ${error.message}. Hãy bấm Làm mới trước khi sửa tiếp.`); return; }
    if (index >= 0) data.mentoring[index] = item;
    else data.mentoring.push(item);
    saveData(); mentorDialog.close(); editingMentorId = null; render(); toast('Đã cập nhật lịch hướng dẫn.');
  });
  document.querySelector('#delete-mentor').addEventListener('click', () => {
    if (!editingMentorId || !confirm('Xóa chủ đề hướng dẫn này?')) return;
    data.mentoring = data.mentoring.filter(item => item.id !== editingMentorId);
    saveData(); mentorDialog.close(); editingMentorId = null; render(); toast('Đã xóa chủ đề hướng dẫn.');
  });

  document.querySelector('#record-form').addEventListener('submit', async event => {
    event.preventDefault();
    const person = data.people.find(p => p.id === selectedId);
    if (!person) return;
    const record = {
      id: editingRecordId || `new-${crypto.randomUUID()}`,
      group: document.querySelector('#field-group').value,
      status: document.querySelector('#field-status').value,
      title: document.querySelector('#field-title').value.trim(),
      when: document.querySelector('#field-when').value.trim(),
      score: document.querySelector('#field-score').value.trim(),
      note: document.querySelector('#field-note').value.trim(),
      sourceRow: null,
    };
    if (!record.title) return;
    if (record.status === 'done' && record.title === 'Chưa xác định nội dung cụ thể') { toast('Hãy ghi rõ nội dung đã hoàn thành.'); return; }
    try { if (window.TALENT_REMOTE) await window.TALENT_REMOTE.saveRecord(person.id, record); }
    catch (error) { toast(`Không lưu được: ${error.message}`); return; }
    const index = person.records.findIndex(r => r.id === editingRecordId);
    if (index >= 0) person.records[index] = record;
    else person.records.push(record);
    saveData(); closeRecord(); render(); toast('Đã lưu nội dung.');
  });

  document.querySelector('#delete-record').addEventListener('click', () => {
    const person = data.people.find(p => p.id === selectedId);
    if (!person || !editingRecordId || !confirm('Xóa nội dung này khỏi hồ sơ?')) return;
    person.records = person.records.filter(r => r.id !== editingRecordId);
    saveData(); closeRecord(); render(); toast('Đã xóa nội dung.');
  });
  document.querySelector('#close-dialog').addEventListener('click', closeRecord);
  document.querySelector('#cancel-dialog').addEventListener('click', closeRecord);
  document.querySelector('#reset-data').addEventListener('click', () => {
    if (!validData(window.TALENT_SEED) || !window.TALENT_SEED.people.length) return;
    if (!confirm('Nạp lại dữ liệu gốc từ Excel sẽ thay thế các chỉnh sửa đang lưu trên trình duyệt này. Tiếp tục?')) return;
    data = structuredClone(window.TALENT_SEED);
    selectedId = null;
    saveData();
    render();
    toast('Đã nạp lại dữ liệu gốc từ Excel.');
  });
  document.querySelector('#import-button').addEventListener('click', () => document.querySelector('#import-file').click());
  document.querySelector('#import-file').addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const incoming = JSON.parse(await file.text());
      if (!validData(incoming) || !incoming.people.length) throw new Error('Sai cấu trúc dữ liệu');
      if (data.people.length && !confirm('Nhập dữ liệu sẽ thay thế các chỉnh sửa hiện có trong trình duyệt này. Tiếp tục?')) return;
      data = incoming;
      selectedId = null;
      saveData();
      render();
      toast('Đã nhập dữ liệu.');
    } catch (_) { toast('Không đọc được tệp dữ liệu phù hợp.'); }
    finally { event.target.value = ''; }
  });
  document.querySelector('#export-button').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `talent-track-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
    toast('Đã tải bản sao dữ liệu.');
  });
  render();
})();
