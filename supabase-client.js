// Public project settings. Row Level Security protects the data; never put a secret key here.
(() => {
  'use strict';
  const URL = 'https://ksyjvzbjpxsbfmmfdjqy.supabase.co';
  const KEY = 'sb_publishable_H0uGG7fzm4mhw69pE3bFeg_nYgo-3ys';
  const EDITORS = new Set(['thuta@pvep.com.vn', 'trinhhv@pvep.com.vn']);
  const client = window.supabase?.createClient(URL, KEY);
  const login = document.querySelector('#login-screen');
  const shell = document.querySelector('.app-shell');
  const message = document.querySelector('#login-message');
  const emailInput = document.querySelector('#login-email');
  let started = false;

  function showLogin(text = '') {
    shell.hidden = true;
    login.hidden = false;
    message.textContent = text;
  }

  function dateFromSchedule(schedule) {
    const text = String(schedule || '');
    const match = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
    if (!match) return null;
    const day = Number(match[1]), month = Number(match[2]), year = Number(match[3]);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
      ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : null;
  }

  function periodToDate(period) {
    const [month, year] = period.split('/');
    return `${year}-${month}-01`;
  }
  function periodFromDate(date) { return `${date.slice(5, 7)}/${date.slice(0, 4)}`; }

  async function rows(table) {
    const result = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await client.from(table).select('*').range(offset, offset + 499);
      if (error) throw error;
      result.push(...data);
      if (data.length < 500) return result;
    }
  }

  async function checked(promise) {
    const { data, error } = await promise;
    if (error) throw error;
    return data;
  }

  async function load() {
    const [targets, employees, activities, assessments, topics, sessions] = await Promise.all([
      rows('talent_targets'), rows('talent_employees'), rows('talent_activities'),
      rows('talent_assessments'), rows('talent_mentoring_topics'), rows('talent_mentoring_sessions'),
    ]);
    if (!employees.length) throw new Error('Không đọc được nhân sự. Hãy kiểm tra tài khoản đăng nhập và chính sách RLS.');
    const people = employees.map(p => ({
      id: p.id, name: p.name, unit: p.unit, leave: p.on_leave,
      records: activities.filter(r => r.employee_id === p.id).map(r => ({
        id: r.id, group: r.group_code, title: r.title, status: r.status,
        when: r.when_text, score: r.score_text, note: r.note, sourceRow: r.source_row,
      })),
      paf: assessments.filter(a => a.employee_id === p.id && (a.score !== null || a.grade))
        .map(a => ({ period: periodFromDate(a.period), score: a.score ?? '', grade: a.grade || '' }))
        .sort((a, b) => periodToDate(a.period).localeCompare(periodToDate(b.period))),
    }));
    const mentoring = topics.map(t => ({
      id: t.id, mentor: t.mentor, role: t.role, topic: t.topic,
      sessions: sessions.filter(s => s.topic_id === t.id && s.schedule).map(s => ({
        id: s.id, period: periodFromDate(s.period), schedule: s.schedule, sessionDate: s.session_date,
      })),
    }));
    return {
      version: 1, source: 'Supabase · dữ liệu chung',
      targets: Object.fromEntries(targets.map(t => [t.id, t.target_count])),
      people, mentoring, sheets: [],
    };
  }

  const remote = {
    async saveRecord(employeeId, record) {
      await checked(client.from('talent_activities').upsert({
        id: record.id, employee_id: employeeId, group_code: record.group,
        title: record.title, status: record.status, when_text: record.when,
        score_text: record.score, note: record.note,
      }, { onConflict: 'id' }));
    },
    async completeRecord(recordId) {
      await checked(client.from('talent_activities').update({ status: 'done' }).eq('id', recordId));
    },
    async savePaf(employeeId, period, score, grade) {
      const date = periodToDate(period);
      const existing = await checked(client.from('talent_assessments')
        .select('id').eq('employee_id', employeeId).eq('period', date).maybeSingle());
      if (existing) {
        await checked(client.from('talent_assessments').update({ score: score === '' ? null : score, grade })
          .eq('id', existing.id));
      } else if (score !== '' || grade) {
        await checked(client.from('talent_assessments').insert({
          id: `paf-new-${crypto.randomUUID()}`, employee_id: employeeId, period: date,
          score: score === '' ? null : score, grade,
        }));
      }
    },
    async saveMentor(item, previous) {
      await checked(client.from('talent_mentoring_topics').upsert({
        id: item.id, topic: item.topic, mentor: item.mentor, role: item.role,
      }, { onConflict: 'id' }));
      const oldByPeriod = new Map((previous?.sessions || []).map(s => [s.period, s]));
      const newByPeriod = new Map(item.sessions.map(s => [s.period, s]));
      for (const [period, old] of oldByPeriod) {
        if (!newByPeriod.has(period)) {
          await checked(client.from('talent_mentoring_sessions').update({ schedule: '', session_date: null }).eq('id', old.id));
        }
      }
      for (const session of item.sessions) {
        const old = oldByPeriod.get(session.period);
        if (old) {
          await checked(client.from('talent_mentoring_sessions').update({
            schedule: session.schedule, session_date: dateFromSchedule(session.schedule),
          }).eq('id', old.id));
          session.id = old.id;
        } else {
          session.id = `${item.id}-${periodToDate(session.period).slice(0, 7)}`;
          await checked(client.from('talent_mentoring_sessions').upsert({
            id: session.id, topic_id: item.id, period: periodToDate(session.period),
            schedule: session.schedule, session_date: dateFromSchedule(session.schedule),
          }, { onConflict: 'id' }));
        }
      }
    },
    async removeRecord(id) { await checked(client.from('talent_activities').delete().eq('id', id)); },
    async removeMentor(id) {
      await checked(client.from('talent_mentoring_sessions').delete().eq('topic_id', id));
      await checked(client.from('talent_mentoring_topics').delete().eq('id', id));
    },
  };

  async function start() {
    if (started) return;
    started = true;
    try {
      window.TALENT_SEED = await load();
      window.TALENT_REMOTE = remote;
      login.hidden = true;
      shell.hidden = false;
      const script = document.createElement('script');
      script.src = 'app.js';
      document.body.append(script);
    } catch (error) {
      started = false;
      showLogin(`Không tải được dữ liệu: ${error.message}`);
    }
  }

  document.querySelector('#login-form').addEventListener('submit', async event => {
    event.preventDefault();
    const email = emailInput.value.trim().toLowerCase();
    if (!EDITORS.has(email)) { message.textContent = 'Email này chưa có quyền truy cập chương trình.'; return; }
    const button = event.submitter;
    button.disabled = true;
    message.textContent = 'Đang gửi liên kết đăng nhập…';
    const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
    message.textContent = error ? `Không gửi được email: ${error.message}` : 'Đã gửi liên kết đăng nhập. Hãy mở email và bấm vào liên kết.';
    button.disabled = false;
  });

  document.querySelector('#logout-button').addEventListener('click', async () => {
    await client.auth.signOut();
    location.reload();
  });
  document.querySelector('#refresh-button').addEventListener('click', () => location.reload());

  if (!client) { showLogin('Không tải được thư viện Supabase. Hãy kiểm tra kết nối Internet.'); return; }
  client.auth.getSession().then(({ data, error }) => {
    if (error) showLogin(error.message);
    else if (data.session && EDITORS.has(data.session.user.email?.toLowerCase())) start();
    else showLogin();
  }).catch(error => showLogin(`Không kiểm tra được đăng nhập: ${error.message}`));
})();
