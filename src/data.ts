export type Profile = {
  id: string
  name: string
  birthday: string
  avatar: string
  bio: string
}

export type Memory = {
  id: string
  title: string
  date: string
  location: string
  image: string
  note: string
  favorite: boolean
}

export type ImportantDate = {
  id: string
  title: string
  date: string
  emoji: string
  annual: boolean
}

export type Plan = {
  id: string
  title: string
  category: string
  date: string
  done: boolean
}

export type Message = {
  id: string
  text: string
  senderId: string
  createdAt: string
}

export type AppData = {
  startDate: string
  profiles: Profile[]
  memories: Memory[]
  dates: ImportantDate[]
  plans: Plan[]
  messages: Message[]
  mood: string
}

const STORAGE_KEY = 'blizhe:app-data:v1'
const DAY_MS = 86_400_000

/** Parse a calendar date as local time, never as a UTC timestamp. */
function parseCalendarDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2]) - 1
  const day = Number(match[3])
  const result = new Date(0)
  result.setFullYear(year, month, day)
  result.setHours(0, 0, 0, 0)
  if (
    result.getFullYear() !== year ||
    result.getMonth() !== month ||
    result.getDate() !== day
  ) return null
  return result
}

function calendarSerial(date: Date): number {
  const utc = new Date(0)
  utc.setUTCFullYear(date.getFullYear(), date.getMonth(), date.getDate())
  utc.setUTCHours(0, 0, 0, 0)
  return utc.getTime() / DAY_MS
}

function calendarString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function relativeDate(offset: number): string {
  const result = new Date()
  result.setDate(result.getDate() + offset)
  return calendarString(result)
}

function recentMessage(minutesAgo: number): string {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString()
}

export const seedData: AppData = {
  startDate: '2025-09-14',
  profiles: [
    {
      id: 'anya',
      name: 'Аня',
      birthday: '2001-05-18',
      avatar: '/photos/anya.jpg',
      bio: 'Собираю маленькие счастливые моменты ☀️',
    },
    {
      id: 'sasha',
      name: 'Саша',
      birthday: '2000-11-07',
      avatar: '/photos/sasha.jpg',
      bio: 'Все лучшие приключения — с тобой.',
    },
  ],
  memories: [
    {
      id: 'memory-seaside',
      title: 'Там, где только мы',
      date: relativeDate(-8),
      location: 'Амальфи, Италия',
      image: '/photos/seaside.jpg',
      note: 'Солёный воздух, долгие прогулки и никуда не нужно спешить. Хочу запомнить это чувство.',
      favorite: true,
    },
    {
      id: 'memory-ocean',
      title: 'Ещё один закат с тобой',
      date: relativeDate(-15),
      location: 'У моря',
      image: '/photos/sunset.jpg',
      note: 'Смотрели, как солнце растворяется в море. Самый красивый вечер этого лета.',
      favorite: true,
    },
    {
      id: 'memory-coffee',
      title: 'Наше маленькое утро',
      date: relativeDate(-22),
      location: 'Любимая кофейня',
      image: '/photos/coffee.jpg',
      note: 'Два капучино, один круассан на двоих и разговоры обо всём.',
      favorite: false,
    },
    {
      id: 'memory-mountains',
      title: 'Выше облаков',
      date: relativeDate(-41),
      location: 'Красная Поляна',
      image: '/photos/mountains.jpg',
      note: 'Подъём был непростым, но этот вид и твоя рука в моей стоили каждого шага.',
      favorite: false,
    },
    {
      id: 'memory-picnic',
      title: 'Пикник без повода',
      date: relativeDate(-58),
      location: 'Наш парк',
      image: '/photos/picnic.jpg',
      note: 'Взяли плед, клубнику и любимый плейлист. Иногда для счастья нужно совсем немного.',
      favorite: true,
    },
    {
      id: 'memory-together',
      title: 'Просто быть рядом',
      date: relativeDate(-76),
      location: 'Наша история',
      image: '/photos/together.jpg',
      note: 'Пусть таких дней будет как можно больше.',
      favorite: false,
    },
  ],
  dates: [
    { id: 'date-anniversary', title: 'Наша годовщина', date: '2025-09-14', emoji: '🤍', annual: true },
    { id: 'date-weekend', title: 'Выходные вдвоём', date: relativeDate(5), emoji: '🌿', annual: false },
    { id: 'date-sasha-birthday', title: 'День рождения Саши', date: '2000-11-07', emoji: '🎂', annual: true },
    { id: 'date-anya-birthday', title: 'День рождения Ани', date: '2001-05-18', emoji: '🎂', annual: true },
  ],
  plans: [
    { id: 'plan-dinner', title: 'Приготовить пасту вместе', category: 'Дома', date: relativeDate(1), done: false },
    { id: 'plan-cinema', title: 'Сходить в кино на последний ряд', category: 'Свидание', date: relativeDate(3), done: false },
    { id: 'plan-trip', title: 'Сбежать на выходные за город', category: 'Путешествия', date: relativeDate(5), done: false },
    { id: 'plan-walk', title: 'Встретить рассвет у воды', category: 'Прогулка', date: relativeDate(-4), done: true },
  ],
  messages: [
    { id: 'message-1', text: 'Нашла такое красивое место для прогулки 🌿', senderId: 'anya', createdAt: recentMessage(42) },
    { id: 'message-2', text: 'Давай сходим в выходные? Возьмём кофе с собой', senderId: 'anya', createdAt: recentMessage(41) },
    { id: 'message-3', text: 'С тобой — куда угодно 🤍', senderId: 'sasha', createdAt: recentMessage(35) },
    { id: 'message-4', text: 'Тогда это наше маленькое свидание', senderId: 'anya', createdAt: recentMessage(32) },
  ],
  mood: 'В любви',
}

function freshSeed(): AppData {
  return JSON.parse(JSON.stringify(seedData)) as AppData
}

type UnknownRecord = Record<string, unknown>
function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function isString(value: unknown): value is string {
  return typeof value === 'string'
}
function isDate(value: unknown): value is string {
  return isString(value) && parseCalendarDate(value) !== null
}
function isOptionalDate(value: unknown): value is string {
  return value === '' || isDate(value)
}
function strings(record: UnknownRecord, keys: string[]): boolean {
  return keys.every((key) => isString(record[key]))
}
function safeArray<T>(value: unknown, guard: (entry: unknown) => entry is T, fallback: T[]): T[] {
  return Array.isArray(value) ? value.filter(guard) : fallback
}

const isProfile = (value: unknown): value is Profile =>
  isRecord(value) && strings(value, ['id', 'name', 'avatar', 'bio']) && isOptionalDate(value.birthday)
const isMemory = (value: unknown): value is Memory =>
  isRecord(value) && strings(value, ['id', 'title', 'location', 'image', 'note']) && isDate(value.date) && typeof value.favorite === 'boolean'
const isImportantDate = (value: unknown): value is ImportantDate =>
  isRecord(value) && strings(value, ['id', 'title', 'emoji']) && isDate(value.date) && typeof value.annual === 'boolean'
const isPlan = (value: unknown): value is Plan =>
  isRecord(value) && strings(value, ['id', 'title', 'category']) && isOptionalDate(value.date) && typeof value.done === 'boolean'
const isMessage = (value: unknown): value is Message =>
  isRecord(value) && strings(value, ['id', 'text', 'senderId', 'createdAt']) && Number.isFinite(Date.parse(value.createdAt as string))

export function loadData(): AppData {
  const fallback = freshSeed()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return fallback
    const stored: unknown = JSON.parse(raw)
    if (!isRecord(stored)) return fallback
    const profiles = safeArray(stored.profiles, isProfile, fallback.profiles)
    return {
      startDate: isDate(stored.startDate) ? stored.startDate : fallback.startDate,
      profiles: profiles.length >= 2 ? profiles.slice(0, 2) : fallback.profiles,
      memories: safeArray(stored.memories, isMemory, fallback.memories),
      dates: safeArray(stored.dates, isImportantDate, fallback.dates),
      plans: safeArray(stored.plans, isPlan, fallback.plans),
      messages: safeArray(stored.messages, isMessage, fallback.messages),
      mood: isString(stored.mood) ? stored.mood : fallback.mood,
    }
  } catch {
    return fallback
  }
}

/** False means storage is unavailable or full; callers can keep the state in memory. */
export function saveData(data: AppData): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    return true
  } catch {
    return false
  }
}

export function uniqueId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`
}

export function dayCount(startDate: string, now = new Date()): number {
  const start = parseCalendarDate(startDate)
  if (!start || !Number.isFinite(now.getTime())) return 0
  return Math.max(0, calendarSerial(now) - calendarSerial(start))
}

/** February 29 anniversaries fall on February 28 in non-leap years. */
export function nextOccurrence(date: string, annual: boolean, now = new Date()): Date {
  const original = parseCalendarDate(date)
  if (!original) return new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (!annual) return original
  if (calendarSerial(original) > calendarSerial(now)) return original
  const inYear = (year: number): Date => {
    const lastDay = new Date(year, original.getMonth() + 1, 0).getDate()
    return new Date(year, original.getMonth(), Math.min(original.getDate(), lastDay))
  }
  const occurrence = inYear(now.getFullYear())
  return calendarSerial(occurrence) < calendarSerial(now) ? inYear(now.getFullYear() + 1) : occurrence
}

/** Match one calendar cell, including leap anniversaries and the first occurrence. */
export function eventOccursOn(date: string, annual: boolean, day: string): boolean {
  const original = parseCalendarDate(date)
  const target = parseCalendarDate(day)
  if (!original || !target) return false
  return calendarSerial(nextOccurrence(date, annual, target)) === calendarSerial(target)
}

export function daysUntil(date: Date, now = new Date()): number {
  if (!Number.isFinite(date.getTime()) || !Number.isFinite(now.getTime())) return 0
  return calendarSerial(date) - calendarSerial(now)
}

export function formatDate(date: string, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }): string {
  const parsed = parseCalendarDate(date) ?? new Date(date)
  if (!Number.isFinite(parsed.getTime())) return ''
  return new Intl.DateTimeFormat('ru-RU', options).format(parsed)
}

export function pluralDays(n: number): string {
  const number = Math.abs(Math.trunc(n))
  const lastTwo = number % 100
  if (lastTwo >= 11 && lastTwo <= 14) return 'дней'
  const last = number % 10
  if (last === 1) return 'день'
  return last >= 2 && last <= 4 ? 'дня' : 'дней'
}

export async function imageFileToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Выберите изображение в формате JPG, PNG или WebP.')
  if (file.size > 15 * 1024 * 1024) throw new Error('Фотография слишком большая. Выберите файл до 15 МБ.')
  if (file.size === 0) throw new Error('Этот файл пуст. Выберите другую фотографию.')

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    const cleanup = () => URL.revokeObjectURL(url)
    image.onload = () => {
      try {
        const scale = Math.min(1, 1400 / Math.max(image.naturalWidth, image.naturalHeight))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
        const context = canvas.getContext('2d')
        if (!context) throw new Error('Не удалось обработать фотографию. Попробуйте другой файл.')
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, canvas.width, canvas.height)
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.8))
      } catch {
        reject(new Error('Не удалось обработать фотографию. Попробуйте JPG, PNG или WebP.'))
      } finally {
        cleanup()
      }
    }
    image.onerror = () => {
      cleanup()
      reject(new Error('Не удалось открыть изображение. Попробуйте JPG, PNG или WebP.'))
    }
    image.src = url
  })
}
