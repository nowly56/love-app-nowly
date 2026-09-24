import assert from 'node:assert/strict'
import test from 'node:test'
import type { TestContext } from 'node:test'
import {
  dayCount,
  daysUntil,
  eventOccursOn,
  formatDate,
  loadData,
  nextOccurrence,
  saveData,
  seedData,
} from '../src/data.ts'

function withTimezone(t: TestContext, timezone: string) {
  const previous = process.env.TZ
  process.env.TZ = timezone
  t.after(() => {
    if (previous === undefined) delete process.env.TZ
    else process.env.TZ = previous
  })
}

function withStorage(t: TestContext) {
  let raw: string | null = null
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const storage = {
    getItem: (_key: string) => raw,
    setItem: (_key: string, value: string) => { raw = value },
  }
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true })
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  })
  return {
    storage,
    setRaw: (value: string | null) => { raw = value },
  }
}

function calendarParts(date: Date) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
}

for (const timezone of ['UTC', 'Europe/Moscow', 'America/New_York', 'Europe/Berlin', 'Pacific/Honolulu', 'Pacific/Auckland']) {
  test(`calendar day arithmetic and formatting are stable in ${timezone}`, (t) => {
    withTimezone(t, timezone)
    assert.equal(dayCount('2025-09-14', new Date(2026, 8, 19, 0, 1)), 370)
    assert.equal(dayCount('2026-09-19', new Date(2026, 8, 19, 23, 59)), 0)
    assert.equal(dayCount('2026-09-20', new Date(2026, 8, 19)), 0)
    assert.equal(dayCount('2026-03-07', new Date(2026, 2, 9)), 2)
    assert.equal(dayCount('2026-03-28', new Date(2026, 2, 30)), 2)
    assert.equal(daysUntil(new Date(2026, 10, 2), new Date(2026, 9, 31)), 2)
    assert.equal(daysUntil(new Date(2026, 9, 26), new Date(2026, 9, 24)), 2)
    assert.equal(daysUntil(new Date(2026, 8, 18), new Date(2026, 8, 19, 23)), -1)
    assert.equal(formatDate('2026-09-19'), '19 сентября')
    assert.deepEqual(calendarParts(nextOccurrence('2025-09-19', false)), [2025, 9, 19])
  })
}

test('DST changes do not add or remove a relationship day', (t) => {
  withTimezone(t, 'America/New_York')
  const springStart = new Date(2026, 2, 8)
  const springEnd = new Date(2026, 2, 9)
  const autumnStart = new Date(2026, 10, 1)
  const autumnEnd = new Date(2026, 10, 2)
  assert.equal((springEnd.getTime() - springStart.getTime()) / 3_600_000, 23)
  assert.equal((autumnEnd.getTime() - autumnStart.getTime()) / 3_600_000, 25)
  assert.equal(dayCount('2026-03-08', springEnd), 1)
  assert.equal(dayCount('2026-11-01', autumnEnd), 1)
  assert.equal(daysUntil(springEnd, springStart), 1)
  assert.equal(daysUntil(autumnEnd, autumnStart), 1)
})

test('annual anniversaries stay on today until midnight, then roll to next year', (t) => {
  withTimezone(t, 'Pacific/Honolulu')
  assert.deepEqual(calendarParts(nextOccurrence('2025-09-14', true, new Date(2026, 8, 13))), [2026, 9, 14])
  assert.deepEqual(calendarParts(nextOccurrence('2025-09-14', true, new Date(2026, 8, 14, 23, 59))), [2026, 9, 14])
  assert.deepEqual(calendarParts(nextOccurrence('2025-09-14', true, new Date(2026, 8, 15))), [2027, 9, 14])
  assert.deepEqual(calendarParts(nextOccurrence('2025-01-01', true, new Date(2026, 11, 31))), [2027, 1, 1])
})

test('February 29 falls on February 28 in common years and returns in leap years', (t) => {
  withTimezone(t, 'Europe/Moscow')
  assert.deepEqual(calendarParts(nextOccurrence('2024-02-29', true, new Date(2027, 0, 1))), [2027, 2, 28])
  assert.deepEqual(calendarParts(nextOccurrence('2024-02-29', true, new Date(2027, 1, 28, 22))), [2027, 2, 28])
  assert.deepEqual(calendarParts(nextOccurrence('2024-02-29', true, new Date(2027, 2, 1))), [2028, 2, 29])
  assert.deepEqual(calendarParts(nextOccurrence('2024-02-29', true, new Date(2028, 1, 29, 22))), [2028, 2, 29])
})

test('an annual event never repeats before its first occurrence', (t) => {
  withTimezone(t, 'Europe/Moscow')
  assert.deepEqual(calendarParts(nextOccurrence('2027-10-10', true, new Date(2026, 8, 19))), [2027, 10, 10])
  assert.deepEqual(calendarParts(nextOccurrence('2027-10-10', true, new Date(2027, 9, 10, 23))), [2027, 10, 10])
  assert.deepEqual(calendarParts(nextOccurrence('2027-10-10', true, new Date(2027, 9, 11))), [2028, 10, 10])
  assert.deepEqual(calendarParts(nextOccurrence('2028-02-29', true, new Date(2026, 0, 1))), [2028, 2, 29])
})

test('calendar cells match exact dates and annual dates only from their first occurrence', (t) => {
  withTimezone(t, 'Pacific/Honolulu')
  assert.equal(eventOccursOn('2027-10-10', false, '2027-10-10'), true)
  assert.equal(eventOccursOn('2027-10-10', false, '2028-10-10'), false)
  assert.equal(eventOccursOn('2027-10-10', true, '2026-10-10'), false)
  assert.equal(eventOccursOn('2027-10-10', true, '2027-10-10'), true)
  assert.equal(eventOccursOn('2027-10-10', true, '2028-10-10'), true)
  assert.equal(eventOccursOn('2027-10-10', true, '2028-10-09'), false)
  assert.equal(eventOccursOn('2027-10-10', true, '2028-11-10'), false)
  assert.equal(eventOccursOn('invalid', true, '2028-10-10'), false)
  assert.equal(eventOccursOn('2027-10-10', true, '2028-02-30'), false)
})

test('February 29 calendar cells use February 28 only in non-leap years after the first event', (t) => {
  withTimezone(t, 'America/New_York')
  assert.equal(eventOccursOn('2028-02-29', true, '2027-02-28'), false)
  assert.equal(eventOccursOn('2028-02-29', true, '2028-02-28'), false)
  assert.equal(eventOccursOn('2028-02-29', true, '2028-02-29'), true)
  assert.equal(eventOccursOn('2028-02-29', true, '2029-02-28'), true)
  assert.equal(eventOccursOn('2028-02-29', true, '2029-03-01'), false)
  assert.equal(eventOccursOn('2028-02-29', true, '2032-02-28'), false)
  assert.equal(eventOccursOn('2028-02-29', true, '2032-02-29'), true)
})

test('storage round trip retains edits, undated plans, and profiles without birthdays', (t) => {
  withStorage(t)
  const data = structuredClone(seedData)
  data.profiles[0].name = 'Маша'
  data.profiles[0].birthday = ''
  data.profiles[1].birthday = ''
  data.plans.push({ id: 'someday', title: 'Увидеть северное сияние', category: 'Путешествия', date: '', done: false })
  data.memories[0].favorite = !data.memories[0].favorite
  assert.equal(saveData(data), true)
  assert.deepEqual(loadData(), data)
})

test('empty storage yields an independent copy of demo data', (t) => {
  withStorage(t)
  const data = loadData()
  assert.deepEqual(data, seedData)
  data.profiles[0].name = 'Изменённое имя'
  assert.equal(loadData().profiles[0].name, seedData.profiles[0].name)
})

test('corrupt JSON and invalid root structures safely recover the demo data', (t) => {
  const { setRaw } = withStorage(t)
  for (const raw of ['{', 'null', '[]', 'false', '42']) {
    setRaw(raw)
    assert.deepEqual(loadData(), seedData)
  }
})

test('malformed records are ignored and invalid dates cannot enter state', (t) => {
  const { setRaw } = withStorage(t)
  setRaw(JSON.stringify({
    startDate: '2026-02-30',
    profiles: [{ ...seedData.profiles[0], birthday: '2026-02-30' }, seedData.profiles[1]],
    memories: [null, {}, { ...seedData.memories[0], date: '' }],
    dates: [{ ...seedData.dates[0], date: '' }],
    plans: [{ ...seedData.plans[0], date: '2026-02-30' }],
    messages: [{ ...seedData.messages[0], createdAt: 'bad date' }],
  }))
  const data = loadData()
  assert.equal(data.startDate, seedData.startDate)
  assert.deepEqual(data.profiles, seedData.profiles)
  assert.deepEqual(data.memories, [])
  assert.deepEqual(data.dates, [])
  assert.deepEqual(data.plans, [])
  assert.deepEqual(data.messages, [])
})

test('quota and storage-access failures return a failure flag without throwing', (t) => {
  const { storage } = withStorage(t)
  storage.setItem = () => { throw new DOMException('Storage full', 'QuotaExceededError') }
  assert.equal(saveData(seedData), false)
  storage.getItem = () => { throw new DOMException('Storage blocked', 'SecurityError') }
  assert.deepEqual(loadData(), seedData)
})
