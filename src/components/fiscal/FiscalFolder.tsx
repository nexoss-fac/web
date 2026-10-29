import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  Camera,
  Check,
  ClipboardCheck,
  Clock3,
  Copy,
  ExternalLink,
  FileText,
  FolderOpen,
  Link2,
  LoaderCircle,
  Plus,
  Search,
  ScanSearch,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import type { FiscalArea, FiscalBoardDocument, FiscalBoardState, FiscalRequirement, FiscalRequirementStatus } from '../../domain/fiscalBoard';
import { FISCAL_AREAS, NATIONAL_FISCAL_REQUIREMENTS } from '../../domain/fiscalBoard';
import { buildFiscalCalendar, computeFiscalNotifications, countDocumentsByStatus, deriveDocumentStatus, toDateKey } from '../../domain/fiscalCalendar';
import { defaultFiscalSettings } from '../../domain/fiscalPortals';
import { buildInspectionItems, compactEntries } from '../../domain/fiscalInspection';
import { FiscalCalendarPanel } from './FiscalCalendarPanel';
import { FiscalPortalsPanel } from './FiscalPortalsPanel';
import { FiscalInspectionPanel } from './FiscalInspectionPanel';
import { compressImageFile, formatFileSize } from '../../utils/imageCompressor';

type Section = 'Resumen' | 'Documentos' | 'Documentos por subir' | 'Inspección' | 'Calendario' | 'Portales' | 'Requisitos' | 'Auditoría';
type StatusFilter = 'Todos' | 'Vigente' | 'Por vencer' | 'Vencido' | 'En trámite';
type BoardView = FiscalBoardState & { publicLinkEnabled: boolean };

const sections: Section[] = ['Resumen', 'Documentos', 'Documentos por subir', 'Inspección', 'Calendario', 'Portales', 'Requisitos', 'Auditoría'];
const statusFilters: StatusFilter[] = ['Todos', 'Vigente', 'Por vencer', 'Vencido', 'En trámite'];
const categories = ['RIF', 'Registro mercantil', 'Solvencia', 'Permiso nacional', 'Declaración', 'Comprobante de pago', 'Otro'];

const emptyBoard: BoardView = {
  documents: [],
  requirements: NATIONAL_FISCAL_REQUIREMENTS,
  auditEvents: [],
  publicLinkEnabled: false,
};

const statusStyle: Record<string, string> = {
  'Pendiente de revisión': 'bg-slate-100 text-slate-700',
  Pendiente: 'bg-amber-50 text-amber-800',
  Cumplido: 'bg-emerald-50 text-emerald-700',
  'No aplica': 'bg-slate-100 text-slate-600',
  Vigente: 'bg-emerald-50 text-emerald-700',
  'Por vencer': 'bg-amber-50 text-amber-800',
  Vencido: 'bg-rose-50 text-rose-700',
  'En trámite': 'bg-sky-50 text-sky-700',
};

export const FiscalFolder: React.FC<{ companyId: string; companyName: string }> = ({ companyId, companyName }) => {
  const [section, setSection] = useState<Section>('Resumen');
  const [board, setBoard] = useState<BoardView>(emptyBoard);
  const [draftRequirements, setDraftRequirements] = useState<FiscalRequirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [pendingInspectionItemId, setPendingInspectionItemId] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(categories[0]);
  const [issuer, setIssuer] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [documentNotes, setDocumentNotes] = useState('');
  const [suggestedRequirement, setSuggestedRequirement] = useState('');
  const [identityInput, setIdentityInput] = useState('');
  const [identityLoading, setIdentityLoading] = useState(false);
  const [identityResult, setIdentityResult] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanSummary, setScanSummary] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [fileData, setFileData] = useState('');
  const [fileName, setFileName] = useState('');
  const [publishDocument, setPublishDocument] = useState(false);
  const [publicUrl, setPublicUrl] = useState('');
  const [area, setArea] = useState<FiscalArea | ''>('');
  const [inProcess, setInProcess] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('Todos');
  const [areaFilter, setAreaFilter] = useState<FiscalArea | 'Todas'>('Todas');
  const today = useMemo(() => toDateKey(new Date()), []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError('');
    setError('');
    setBoard(emptyBoard);
    setPublicUrl('');
    fetch('/api/fiscal-board', { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'No se pudo cargar la carpeta fiscal.');
        if (!controller.signal.aborted) setBoard({ ...emptyBoard, ...data });
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setLoadError(cause instanceof Error ? cause.message : 'No se pudo cargar la carpeta fiscal.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [companyId]);

  const applicableRequirements = board.requirements.filter((item) => item.status !== 'No aplica');
  const completedCount = board.requirements.filter((item) => item.status === 'Cumplido').length;
  const progress = applicableRequirements.length ? Math.round(completedCount / applicableRequirements.length * 100) : 0;
  const filteredDocuments = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('es');
    return board.documents.filter((doc) => {
      const status = deriveDocumentStatus(doc, today);
      return `${doc.title} ${doc.category} ${doc.issuer} ${status} ${doc.area || ''}`.toLocaleLowerCase('es').includes(term)
        && (statusFilter === 'Todos' || status === statusFilter)
        && (areaFilter === 'Todas' || doc.area === areaFilter);
    });
  }, [board.documents, query, statusFilter, areaFilter, today]);
  const settings = board.settings ?? defaultFiscalSettings();
  const inspectionItems = useMemo(() => buildInspectionItems(board.inspection), [board.inspection]);
  const documentsToUpload = useMemo(() => inspectionItems.filter((item) => !item.hidden && item.status !== 'No aplica' && !item.documentIds.some((id) => board.documents.some((doc) => doc.id === id))), [inspectionItems, board.documents]);
  const counts = useMemo(() => countDocumentsByStatus(board.documents, today), [board.documents, today]);
  const notifications = useMemo(() => computeFiscalNotifications(buildFiscalCalendar({ board, today, defaultRemindDays: settings.remindDaysBefore })), [board, today, settings.remindDaysBefore]);

  // Avisos del navegador: una sola vez por entrada y etapa, y solo si la persona los activó.
  useEffect(() => {
    if (loading || !settings.notificationsEnabled || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const storageKey = `nexoss-fiscal-notified:${companyId}`;
    let seen: string[] = [];
    try { seen = JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch { seen = []; }
    const fresh = notifications.filter((item) => !seen.includes(item.id)).slice(0, 5);
    fresh.forEach((item) => new Notification(`Calendario fiscal · ${companyName}`, { body: item.message, tag: item.id }));
    if (fresh.length) {
      try { localStorage.setItem(storageKey, JSON.stringify([...seen, ...fresh.map((item) => item.id)].slice(-300))); } catch { /* sin almacenamiento disponible */ }
    }
  }, [loading, notifications, settings.notificationsEnabled, companyId, companyName]);

  const saveBoard = async (next: FiscalBoardState): Promise<boolean> => {
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/fiscal-board', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documents: next.documents, requirements: next.requirements, ...(next.calendar ? { calendar: next.calendar } : {}), ...(next.settings ? { settings: next.settings } : {}), ...(next.inspection ? { inspection: next.inspection } : {}) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo guardar la carpeta fiscal.');
      setBoard({ ...emptyBoard, ...data });
      setNotice(typeof data.compressionMessage === 'string' ? data.compressionMessage : 'Cambios guardados en el expediente de esta empresa.');
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar la carpeta fiscal.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const openAudit = () => {
    setDraftRequirements(board.requirements.map((item) => ({ ...item })));
    setSection('Auditoría');
  };

  const saveAudit = async () => {
    const saved = await saveBoard({ ...board, requirements: draftRequirements });
    if (saved) setSection('Resumen');
  };

  const chooseFile = async (file?: File) => {
    if (!file) {
      setFileName('');
      setFileData('');
      return;
    }
    const allowed = ['application/pdf', 'image/png', 'image/jpeg'];
    if (!allowed.includes(file.type)) {
      setError('El adjunto debe ser un PDF, PNG o JPEG.');
      return;
    }
    // El API recibe JSON en Base64 con límite de 25 MB. Limitamos el archivo
    // original para dejar margen al sobrecoste de Base64 y al resto de metadatos.
    const maxOriginalSize = 17 * 1024 * 1024;
    if (file.size > maxOriginalSize) {
      setError(`El archivo original pesa ${formatFileSize(file.size)}. El máximo para cargarlo es 17 MB; reduce el PDF o exporta las páginas como un PDF optimizado e inténtalo de nuevo.`);
      return;
    }
    try {
      let dataUrl: string;
      let savedName = file.name;
      if (file.type.startsWith('image/')) {
        // Comprimir la fotografía antes de guardarla, manteniendo resolución
        // suficiente para leer documentos fiscales.
        const compressed = await compressImageFile(file, {
          maxDimension: 2200,
          quality: 0.84,
          maxSizeBytes: 3 * 1024 * 1024,
          mimeType: 'image/jpeg',
        });
        dataUrl = compressed.dataUrl;
        savedName = file.name.replace(/\.(png|jpe?g)$/i, '.jpg');
        setNotice(`Imagen optimizada: ${formatFileSize(file.size)} → ${formatFileSize(compressed.compressedSize)}.`);
      } else {
        // Los PDF se conservan íntegros para no perder páginas, texto ni firmas.
        dataUrl = await readFileDataUrl(file);
        setNotice(file.size > 5 * 1024 * 1024
          ? `PDF cargado sin alterar su contenido (${formatFileSize(file.size)}).`
          : '');
      }
      setFileName(savedName);
      setFileData(dataUrl);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo leer o comprimir el archivo seleccionado.');
    }
  };

  const scanSelectedDocument = async () => {
    const isPdf = /\.pdf$/i.test(fileName);
    const isImage = /\.(png|jpe?g|webp)$/i.test(fileName);
    if (!fileData || !fileName || (!isPdf && !isImage)) {
      setError('Selecciona un PDF o una imagen JPEG, PNG o WebP para extraer sus datos.');
      return;
    }
    setScanning(true);
    setError('');
    setScanSummary('');
    try {
      const response = await fetch('/api/fiscal-board/scan-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: fileData }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo analizar el documento.');
      const doc = data.document;
      setTitle(doc.title || '');
      setCategory(categories.includes(doc.category) ? doc.category : 'Otro');
      setIssuer(doc.issuer || '');
      setDocumentNumber(doc.documentNumber || '');
      setOwnerName(doc.ownerName || '');
      setTaxId(doc.taxId || '');
      setIssueDate(doc.issueDate || '');
      setExpiresAt(doc.expiresAt || '');
      setArea(FISCAL_AREAS.some((knownArea) => knownArea === doc.area) ? doc.area as FiscalArea : '');
      setSuggestedRequirement(doc.suggestedRequirement || '');
      setDocumentNotes(doc.notes || '');
      setScanSummary('Documento identificado como ' + (doc.documentType || 'documento') + '. Confianza: ' + (doc.confidence || 'baja') + '. Revisa los campos antes de guardar; el sistema no publica el documento automáticamente.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo analizar la fotografía.');
    } finally {
      setScanning(false);
    }
  };

  const lookupIdentity = async () => {
    setIdentityLoading(true);
    setIdentityResult('');
    setError('');
    try {
      const response = await fetch('/api/identity/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document: identityInput }),
      });
      const data = await response.json();
      if (!response.ok || !data.found) throw new Error(data.error || 'No se encontró el documento.');
      const identity = data.result;
      setOwnerName(identity.name || '');
      setTaxId(identity.rif || identity.document || identityInput.trim());
      if (!issuer.trim()) setIssuer(identity.name || '');
      if (!title.trim()) setTitle((identity.documentType === 'empresa' ? 'Identificación de empresa' : 'Identificación de persona') + ' · ' + (identity.document || identityInput.trim()));
      setIdentityResult('Coincidencia referencial encontrada. Confirma los datos con el documento original antes de guardar.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo consultar la identidad.');
    } finally {
      setIdentityLoading(false);
    }
  };

  const startDocumentForInspection = (itemId: string, itemTitle: string) => {
    setPendingInspectionItemId(itemId);
    setTitle(itemTitle);
    setCategory('Otro');
    setIssuer('');
    setDocumentNumber('');
    setOwnerName('');
    setTaxId('');
    setIssueDate('');
    setDocumentNotes('');
    setSuggestedRequirement(itemTitle);
    setExpiresAt('');
    setFileName('');
    setFileData('');
    setArea('');
    setInProcess(false);
    setPublishDocument(false);
    setError('');
    setShowForm(true);
  };

  const saveDocument = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) return;
    const document: FiscalBoardDocument = {
      id: crypto.randomUUID(),
      title: title.trim(),
      category,
      issuer: issuer.trim() || 'No indicado',
      expiresAt,
      status: inProcess ? 'En trámite' : deriveDocumentStatus({ status: 'Vigente', expiresAt }, today),
      area,
      ...(fileName ? { fileName, fileData } : {}),
      ...(documentNumber ? { documentNumber } : {}),
      ...(ownerName ? { ownerName } : {}),
      ...(taxId ? { taxId } : {}),
      ...(issueDate ? { issueDate } : {}),
      ...(documentNotes ? { notes: documentNotes } : {}),
      ...(suggestedRequirement ? { suggestedRequirement } : {}),
      published: publishDocument,
    };
    const nextDocuments = [document, ...board.documents];
    let nextInspection = board.inspection;
    if (pendingInspectionItemId) {
      const items = buildInspectionItems(board.inspection).map((item) => item.id === pendingInspectionItemId
        ? { ...item, documentIds: [...new Set([...item.documentIds, document.id])].slice(0, 10) }
        : item);
      nextInspection = { entries: compactEntries(items), customItems: items.filter((item) => item.custom).map(({ id, title, section: itemSection }) => ({ id, title, section: itemSection })), observations: board.inspection?.observations ?? '' };
    }
    const saved = await saveBoard({ ...board, documents: nextDocuments, ...(nextInspection ? { inspection: nextInspection } : {}) });
    if (saved) {
      setTitle('');
      setPendingInspectionItemId('');
      setIssuer('');
      setDocumentNumber('');
      setOwnerName('');
      setTaxId('');
      setIssueDate('');
      setDocumentNotes('');
      setSuggestedRequirement('');
      setIdentityInput('');
      setIdentityResult('');
      setScanSummary('');
      setExpiresAt('');
      setFileName('');
      setFileData('');
      setPublishDocument(false);
      setArea('');
      setInProcess(false);
      setShowForm(false);
    }
  };

  const updateDocument = async (documentId: string, patch: Partial<FiscalBoardDocument>) => {
    const documents = board.documents.map((document) => document.id === documentId ? { ...document, ...patch } : document);
    await saveBoard({ ...board, documents });
  };

  const removeDocument = async (documentId: string) => {
    const requirements = board.requirements.map((item) => item.evidenceDocumentId === documentId ? { ...item, evidenceDocumentId: '' } : item);
    const documents = board.documents.filter((item) => item.id !== documentId);
    await saveBoard({ ...board, documents, requirements });
  };

  const createPublicLink = async () => {
    setError('');
    try {
      const response = await fetch('/api/fiscal-board/public-link', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo generar el código QR.');
      const url = new URL(`/cartelera/${companyId}/${data.token}`, window.location.origin).toString();
      setPublicUrl(url);
      setBoard((current) => ({ ...current, publicLinkEnabled: true }));
      setNotice('Enlace público generado. Cualquier persona con este QR podrá consultar la cartelera y los documentos publicados.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo generar el código QR.');
    }
  };

  const revokePublicLink = async () => {
    if (!window.confirm('¿Revocar el QR público? Las personas que ya tengan el enlace dejarán de ver la cartelera.')) return;
    setError('');
    try {
      const response = await fetch('/api/fiscal-board/public-link', { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo revocar el enlace público.');
      setBoard((current) => ({ ...current, publicLinkEnabled: false }));
      setPublicUrl('');
      setNotice('El enlace QR anterior fue revocado.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo revocar el enlace público.');
    }
  };

  const copyPublicLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setNotice('Enlace público copiado.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo copiar el enlace.');
    }
  };

  const localOnly = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);

  if (loading) return <div className="flex min-h-[400px] items-center justify-center text-sm text-slate-500">Cargando expediente fiscal…</div>;
  if (loadError) return <div role="alert" className="m-4 rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800"><p>{loadError}</p><button onClick={() => window.location.reload()} className="mt-3 rounded-lg bg-rose-700 px-3 py-2 text-xs font-bold text-white">Reintentar</button></div>;

  return <div className="min-h-full bg-slate-50 p-3 pb-8 sm:p-6"><div className="mx-auto max-w-7xl space-y-5">
    <header className="flex flex-col justify-between gap-4 rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-5 text-white shadow-sm sm:flex-row sm:items-center sm:p-7">
      <div className="flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-indigo-200"><FolderOpen className="h-6 w-6" /></span><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-200">Administración · Cumplimiento</p><h1 className="mt-1 text-xl font-black tracking-tight sm:text-2xl">Cartelera Fiscal Digital</h1><p className="mt-1 text-xs text-slate-300">Expediente de <strong className="text-white">{companyName}</strong></p></div></div>
      <div className="flex items-center gap-2 self-start rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-[10px] font-semibold text-amber-200 sm:self-auto"><AlertTriangle className="h-4 w-4 shrink-0" />Requisitos referenciales; confirmar aplicabilidad</div>
    </header>

    {error && <div role="alert" className="flex items-start justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800"><span>{error}</span><button onClick={() => setError('')} aria-label="Cerrar error"><X className="h-4 w-4" /></button></div>}
    {notice && <div role="status" className="flex items-start justify-between gap-3 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-800"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Cerrar aviso"><X className="h-4 w-4" /></button></div>}

    <nav className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1.5" aria-label="Secciones de carpeta fiscal">
      {sections.map((item) => <button key={item} onClick={() => item === 'Auditoría' ? openAudit() : setSection(item)} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-bold transition ${section === item ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`}>{item}</button>)}
    </nav>

    {section === 'Resumen' && <div className="space-y-5">
      {notifications.length > 0 && <div role="status" className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-950"><div><p className="font-bold">{notifications.length} aviso{notifications.length === 1 ? '' : 's'} del calendario fiscal</p><ul className="mt-1 space-y-0.5">{notifications.slice(0, 3).map((item) => <li key={item.id}>• {item.message}</li>)}</ul></div><button onClick={() => setSection('Calendario')} className="rounded-lg border border-amber-300 bg-white px-3 py-2 font-bold text-amber-900 hover:bg-amber-100">Ver calendario</button></div>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={ShieldCheck} label="Cumplimiento revisado" value={`${progress}%`} caption={`${completedCount} de ${applicableRequirements.length} requisitos aplicables`} tone="indigo" />
        <Metric icon={FileText} label="Documentos" value={String(board.documents.length)} caption={`${board.documents.filter((item) => item.published).length} publicados en el QR`} tone="blue" />
        <Metric icon={Clock3} label="Pendientes" value={String(applicableRequirements.filter((item) => item.status === 'Pendiente').length)} caption="Requieren revisión o gestión" tone="amber" />
        <Metric icon={CalendarDays} label="Por vencer" value={String(counts.porVencer + counts.vencido)} caption="Documentos por renovar" tone="emerald" />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-bold text-slate-900">Vista de la cartelera</h2><p className="mt-1 text-[11px] text-slate-500">Avance en deberes fiscales de referencia y documentos seleccionados para exhibición.</p></div><button onClick={openAudit} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-2.5 text-xs font-bold text-white hover:bg-indigo-700"><ClipboardCheck className="h-4 w-4" />Auditar cartelera</button></div>
        <div className="mb-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} /></div>
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-100">
          {board.requirements.map((item) => <div key={item.id} className="flex flex-wrap items-center gap-2 px-3 py-3"><span className="min-w-[180px] flex-1 text-xs font-semibold text-slate-800">{item.title}</span><span className="text-[10px] text-slate-500">{item.dueDate ? `Fecha: ${formatDate(item.dueDate)}` : item.frequency}</span><StatusBadge status={item.status} /></div>)}
          {!board.requirements.length && <p className="p-4 text-xs text-slate-500">No hay requisitos configurados.</p>}
        </div>
      </section>

      <section className="rounded-2xl border border-emerald-200 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl"><h2 className="text-sm font-bold text-slate-900">Acceso público con código QR</h2><p className="mt-1 text-xs leading-relaxed text-slate-600">Cualquier persona que tenga el enlace podrá consultar el estado de la cartelera y únicamente los documentos marcados para publicación. No se requiere iniciar sesión. El enlace puede revocarse cuando sea necesario.</p></div>
          <div className="flex flex-wrap gap-2"><button onClick={() => void createPublicLink()} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2.5 text-xs font-bold text-white hover:bg-emerald-800"><Link2 className="h-4 w-4" />{board.publicLinkEnabled ? 'Renovar QR' : 'Crear QR público'}</button>{board.publicLinkEnabled && <button onClick={() => void revokePublicLink()} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50">Revocar</button>}</div>
        </div>
        {board.publicLinkEnabled && !publicUrl && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-[11px] text-amber-900">Ya existe un enlace QR. Por seguridad, no se puede recuperar el código anterior; al renovar se invalidará y emitirá uno nuevo.</p>}
        {publicUrl && <div className="mt-5 flex flex-col items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center">
          <div className="rounded-lg bg-white p-3"><QRCodeSVG value={publicUrl} size={164} level="H" includeMargin /></div>
          <div className="min-w-0 flex-1 text-center sm:text-left"><p className="text-xs font-bold text-slate-900">QR listo para compartir o imprimir</p><a className="mt-2 block break-all text-[11px] text-indigo-700 underline" href={publicUrl} target="_blank" rel="noreferrer">{publicUrl}</a><div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start"><button onClick={() => void copyPublicLink()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"><Copy className="h-3.5 w-3.5" />Copiar enlace</button><a href={publicUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">Ver cartelera <ExternalLink className="h-3.5 w-3.5" /></a></div></div>
        </div>}
        {localOnly && <p className="mt-3 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-900"><AlertTriangle className="h-4 w-4 shrink-0" />Esta instancia está en localhost: el QR solo funcionará en este equipo. Para que un inspector externo pueda abrirlo, el sistema debe estar publicado en una dirección HTTPS accesible por Internet.</p>}
      </section>

      {board.auditEvents && board.auditEvents.length > 0 && <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"><h2 className="text-sm font-bold text-slate-900">Registro de actividad</h2><div className="mt-3 divide-y divide-slate-100">{board.auditEvents.slice(-5).reverse().map((event) => <div key={event.id} className="flex flex-wrap justify-between gap-2 py-2 text-[10px]"><span className="text-slate-700">{event.summary}</span><time className="text-slate-400">{formatDateTime(event.createdAt)}</time></div>)}</div></section>}
    </div>}

    {section === 'Calendario' && <FiscalCalendarPanel board={board} settings={settings} today={today} saving={saving} onSave={(patch) => saveBoard({ ...board, ...patch })} />}

    {section === 'Portales' && <FiscalPortalsPanel settings={settings} saving={saving} onSave={(next) => saveBoard({ ...board, settings: next })} />}
    {section === 'Inspección' && <FiscalInspectionPanel board={board} companyName={companyName} saving={saving} onSave={(inspection) => saveBoard({ ...board, inspection })} />}

    {section === 'Requisitos' && <section className="space-y-3">
      <div><h2 className="text-base font-bold text-slate-900">Obligaciones fiscales de referencia</h2><p className="mt-1 text-xs text-slate-500">Nacionales · estos deberes de conservación, presentación o inscripción no implican por sí solos exhibición en cartelera pública.</p></div>
      {board.requirements.map((item) => <RequirementCard key={item.id} item={item} />)}
      <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-950">La lista es una ayuda de organización, no una certificación legal exhaustiva ni una lista verificada de documentos cuya exhibición pública sea obligatoria. Algunas obligaciones dependen de la forma jurídica, número de trabajadores, condición tributaria, actividad y municipio de la empresa. La ubicación municipal se puede añadir en una etapa posterior.</p>
    </section>}

    {section === 'Documentos' && <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h2 className="text-base font-bold text-slate-900">Documentos y permisos</h2><p className="mt-1 text-xs text-slate-500">Carga soportes, registra vencimientos y elige expresamente cuáles se verán en el QR público.</p></div><div className="flex flex-wrap gap-2"><button onClick={openAudit} className="inline-flex items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-white px-3.5 py-2.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50"><ClipboardCheck className="h-4 w-4" />Auditar cartelera</button><button onClick={() => { setError(''); setShowForm(true); }} className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-indigo-700"><Plus className="h-4 w-4" />Agregar documento</button></div></div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">{[['Total', counts.total, 'bg-slate-100 text-slate-800'], ['Vigentes', counts.vigente, 'bg-emerald-50 text-emerald-800'], ['Por vencer', counts.porVencer, 'bg-amber-50 text-amber-800'], ['Vencidos', counts.vencido, 'bg-rose-50 text-rose-800'], ['En trámite', counts.enTramite, 'bg-sky-50 text-sky-800']].map(([label, value, tone]) => <div key={String(label)} className={`rounded-xl p-3 text-center ${tone}`}><p className="text-xl font-black">{value}</p><p className="text-[10px] font-bold">{label}</p></div>)}</div>
      <div className="flex flex-wrap items-center gap-2">{statusFilters.map((item) => <button key={item} type="button" onClick={() => setStatusFilter(item)} aria-pressed={statusFilter === item} className={`rounded-full border px-3 py-1.5 text-[11px] font-bold ${statusFilter === item ? 'border-amber-400 bg-amber-100 text-amber-900' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400'}`}>{item === 'Todos' ? 'Todos los estados' : item}</button>)}<select value={areaFilter} onChange={(event) => setAreaFilter(event.target.value as FiscalArea | 'Todas')} aria-label="Filtrar por área" className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600"><option value="Todas">Todas las áreas</option>{FISCAL_AREAS.map((item) => <option key={item}>{item}</option>)}</select></div>
      <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5"><Search className="h-4 w-4 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full text-xs outline-none placeholder:text-slate-400" placeholder="Buscar documento, organismo o estado" /></label>
      {filteredDocuments.length ? <div className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="divide-y divide-slate-100">{filteredDocuments.map((doc) => <article key={doc.id} className="flex flex-wrap items-center gap-3 p-4"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><FileText className="h-5 w-5" /></span><div className="min-w-[180px] flex-1"><h3 className="text-xs font-bold text-slate-800">{doc.title}</h3><p className="mt-1 text-[10px] text-slate-500">{doc.category} · {doc.area || 'Sin área'} · Emisor: {doc.issuer}</p><p className="mt-1 text-[10px] text-slate-400">{doc.fileName ? `Adjunto: ${doc.fileName}` : 'Sin archivo digital'}{doc.expiresAt ? ` · Vence: ${formatDate(doc.expiresAt)}` : ''}</p></div><StatusBadge status={deriveDocumentStatus(doc, today)} /><label className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-600"><input type="checkbox" checked={doc.status === 'En trámite'} disabled={saving} onChange={(event) => void updateDocument(doc.id, { status: event.target.checked ? 'En trámite' : deriveDocumentStatus({ status: 'Vigente', expiresAt: doc.expiresAt }, today) })} />En trámite</label><label className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-600"><input type="checkbox" checked={doc.published} disabled={saving} onChange={(event) => void updateDocument(doc.id, { published: event.target.checked })} />Publicar</label><button onClick={() => { if (window.confirm(`¿Eliminar «${doc.title}» del expediente?`)) void removeDocument(doc.id); }} disabled={saving} aria-label={`Eliminar ${doc.title}`} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"><Trash2 className="h-4 w-4" /></button></article>)}</div></div> : <EmptyState icon={FolderOpen} title="Aún no hay documentos" text="Agrega el RIF, constancias, declaraciones y otros soportes de esta empresa." action={<button onClick={() => setShowForm(true)} className="mt-3 text-xs font-bold text-indigo-600">+ Agregar el primer documento</button>} />}
    </div>}

    {section === 'Documentos por subir' && <div className="space-y-4">
      <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4"><h2 className="text-base font-bold text-indigo-950">Documentos por subir</h2><p className="mt-1 text-xs leading-relaxed text-indigo-900">Esta lista se alimenta de los puntos de la inspección fiscal que todavía no tienen un archivo vinculado. Selecciona “Subir y vincular” para adjuntar el soporte; quedará guardado en la carpeta documental y asociado automáticamente al punto de inspección.</p><div className="mt-3 flex flex-wrap gap-2"><span className="rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-indigo-800">Pendientes: {documentsToUpload.length}</span><span className="rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-indigo-800">Documentos registrados: {board.documents.length}</span></div></div>
      <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5"><Search className="h-4 w-4 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full text-xs outline-none placeholder:text-slate-400" placeholder="Buscar punto de inspección o documento pendiente" /></label>
      {documentsToUpload.filter((item) => !query.trim() || `${item.number} ${item.title} ${item.section} ${item.value} ${item.notes}`.toLocaleLowerCase('es').includes(query.trim().toLocaleLowerCase('es'))).length ? <div className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="divide-y divide-slate-100">{documentsToUpload.filter((item) => !query.trim() || `${item.number} ${item.title} ${item.section} ${item.value} ${item.notes}`.toLocaleLowerCase('es').includes(query.trim().toLocaleLowerCase('es'))).map((item) => <article key={item.id} className="flex flex-wrap items-center gap-3 p-4"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700"><FileText className="h-5 w-5" /></span><div className="min-w-[180px] flex-1"><h3 className="text-xs font-bold text-slate-800">{item.number}. {item.title}</h3><p className="mt-1 text-[10px] text-slate-500">{item.section}{item.status ? ` · Inspección: ${item.status}` : ' · Sin revisar'}</p>{item.value && <p className="mt-1 text-[10px] text-slate-500">Dato: {item.value}</p>}</div><button type="button" onClick={() => startDocumentForInspection(item.id, item.title)} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-[11px] font-bold text-white hover:bg-indigo-700"><Plus className="h-3.5 w-3.5" />Subir y vincular</button></article>)}</div></div> : <EmptyState icon={ClipboardCheck} title="No hay documentos pendientes" text="Todos los puntos visibles y aplicables de la inspección ya tienen al menos un documento vinculado, o no hay coincidencias con la búsqueda." action={<button type="button" onClick={() => setSection('Inspección')} className="mt-3 text-xs font-bold text-indigo-600">Revisar inspección</button>} />}
    </div>}

    {section === 'Auditoría' && <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-bold text-slate-900">Auditoría de la cartelera</h2><p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-500">Verifica cada punto, asigna responsable, fecha objetivo, observaciones y un documento de soporte. Los cambios quedan registrados en la bitácora.</p></div><div className="flex gap-2"><button onClick={() => setSection('Resumen')} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600">Cancelar</button><button onClick={() => void saveAudit()} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3.5 py-2.5 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50"><Check className="h-4 w-4" />{saving ? 'Guardando…' : 'Guardar auditoría'}</button></div></div>
      {draftRequirements.map((item) => <AuditRequirement key={item.id} item={item} documents={board.documents} onChange={(patch) => setDraftRequirements((current) => current.map((row) => row.id === item.id ? { ...row, ...patch } : row))} />)}
      {!draftRequirements.length && <EmptyState icon={ClipboardCheck} title="No hay requisitos para auditar" text="La lista de referencia no está disponible." />}
    </div>}

    {saving && <div role="status" className="fixed bottom-5 right-5 z-30 rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-lg">Guardando cambios…</div>}
  </div>
  {showForm && <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-slate-950/60 p-3 backdrop-blur-sm"><form onSubmit={(event) => void saveDocument(event)} className="my-auto w-full max-w-lg space-y-4 rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
    <div className="flex items-start justify-between"><div><p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">Carpeta de {companyName}</p><h2 className="mt-1 text-lg font-black text-slate-900">{pendingInspectionItemId ? 'Subir documento de inspección' : 'Agregar documento'}</h2>{pendingInspectionItemId && <p className="mt-1 text-[11px] text-indigo-700">Se vinculará automáticamente al punto: {title}</p>}</div><button type="button" onClick={() => setShowForm(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Cerrar"><X className="h-5 w-5" /></button></div>
    <section className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/70 p-3">
      <div className="flex items-center gap-2"><Camera className="h-5 w-5 text-indigo-700" /><div><h3 className="text-xs font-extrabold text-indigo-950">Fotografiar e identificar documento</h3><p className="mt-0.5 text-[10px] text-indigo-800">Toma una foto nítida. NEXOSS intentará identificar el documento y completar los campos.</p></div></div>
      <div className="grid gap-3 sm:grid-cols-2"><label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-700">Subir documento (PDF o imagen)</span><input type="file" accept=".pdf,application/pdf,image/png,image/jpeg" onChange={(event) => { void chooseFile(event.target.files?.[0]); setScanSummary(''); event.currentTarget.value = ''; }} className="block w-full rounded-lg border border-slate-200 bg-white p-2 text-xs file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold" /><span className="block text-[10px] text-slate-500">PDF hasta 17 MB e imágenes comprimidas · pulsa «Leer foto y completar» para extraer los datos</span></label><label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-700">Tomar foto con la cámara</span><input type="file" accept="image/*" capture="environment" onChange={(event) => { void chooseFile(event.target.files?.[0]); setScanSummary(''); event.currentTarget.value = ''; }} className="block w-full rounded-lg border border-slate-200 bg-white p-2 text-xs file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold" /></label></div>
      {fileName && <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white p-2"><span className="min-w-0 flex-1 truncate text-[10px] text-slate-600">{fileName}</span><button type="button" onClick={() => void scanSelectedDocument()} disabled={scanning} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-[11px] font-bold text-white disabled:opacity-50">{scanning ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <ScanSearch className="h-3.5 w-3.5" />}{scanning ? 'Analizando…' : 'Leer foto y completar'}</button></div>}
      {scanSummary && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-[10px] leading-5 text-emerald-800">{scanSummary}</p>}
    </section>
    <section className="space-y-2 rounded-xl border border-slate-200 p-3">
      <h3 className="text-xs font-extrabold text-slate-800">Identificar persona o empresa por cédula/RIF</h3>
      <div className="flex gap-2"><input value={identityInput} onChange={(event) => setIdentityInput(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs" placeholder="Ej. V12345678 o J123456789" /><button type="button" onClick={() => void lookupIdentity()} disabled={identityLoading || !identityInput.trim()} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-[11px] font-bold text-white disabled:opacity-50">{identityLoading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}{identityLoading ? 'Buscando…' : 'Consultar'}</button></div>
      {identityResult && <p role="status" className="text-[10px] leading-5 text-emerald-700">{identityResult}</p>}
      <p className="text-[10px] leading-4 text-slate-500">La consulta requiere configurar un proveedor de identidad en el servidor. Los resultados son referenciales y debes verificarlos.</p>
    </section>
    <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-700">Nombre o número del documento *</span><input required value={title} onChange={(event) => setTitle(event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400" placeholder="Ej. Constancia del RIF" /></label>
    <div className="grid gap-3 sm:grid-cols-2"><label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-700">Tipo</span><select value={category} onChange={(event) => setCategory(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs">{categories.map((item) => <option key={item}>{item}</option>)}</select></label><label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-700">Fecha de vencimiento</span><input type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-xs" /></label></div>
    <div className="grid gap-3 sm:grid-cols-2"><label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-700">Área</span><select value={area} onChange={(event) => setArea(event.target.value as FiscalArea | '')} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs"><option value="">Sin área</option>{FISCAL_AREAS.map((item) => <option key={item}>{item}</option>)}</select></label><label className="flex items-end gap-2 pb-2.5 text-xs font-semibold text-slate-700"><input type="checkbox" checked={inProcess} onChange={(event) => setInProcess(event.target.checked)} />El trámite está en proceso (aún no lo emiten)</label></div>
    <div className="grid gap-3 sm:grid-cols-2"><label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-700">Número del documento</span><input value={documentNumber} onChange={(event) => setDocumentNumber(event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-xs" /></label><label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-700">Fecha de emisión</span><input type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-xs" /></label></div>
    <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-700">Titular / razón social</span><input value={ownerName} onChange={(event) => setOwnerName(event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-xs" placeholder="Nombre o empresa titular" /></label>
    <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-700">Cédula o RIF detectado</span><input value={taxId} onChange={(event) => setTaxId(event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-xs" placeholder="V-, E-, J-, G-…" /></label>
        <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-700">Organismo emisor</span><input value={issuer} onChange={(event) => setIssuer(event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-xs" placeholder="Ej. SENIAT, IVSS…" /></label>
    <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-700">Observaciones extraídas</span><textarea value={documentNotes} onChange={(event) => setDocumentNotes(event.target.value)} rows={2} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-xs" placeholder="Datos legibles adicionales…" /></label>
    {suggestedRequirement && <p className="rounded-lg bg-slate-50 p-2 text-[10px] text-slate-600">Obligación sugerida: {suggestedRequirement}</p>}
    <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-700">Archivo de soporte (PDF, PNG o JPEG; hasta 5 MB)</span><input type="file" accept=".pdf,image/png,image/jpeg" onChange={(event) => void chooseFile(event.target.files?.[0])} className="block w-full rounded-lg border border-slate-200 p-2 text-xs file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold" />{fileName && <span className="block text-[10px] text-slate-500">{fileName}</span>}</label>
    <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-950"><input type="checkbox" checked={publishDocument} onChange={(event) => setPublishDocument(event.target.checked)} className="mt-0.5" /><span><strong>Publicar en la cartelera QR.</strong> Si lo marcas, cualquier persona con el enlace público podrá ver y descargar este documento. Déjalo desmarcado para mantenerlo privado dentro del expediente.</span></label>
    <div className="flex justify-end gap-2 border-t border-slate-100 pt-3"><button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600">Cancelar</button><button type="submit" disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50">Agregar documento</button></div>
  </form></div>}
  </div>;
};

function AuditRequirement({ item, documents, onChange }: { item: FiscalRequirement; documents: FiscalBoardDocument[]; onChange: (patch: Partial<FiscalRequirement>) => void }) {
  return <article className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><h3 className="text-sm font-bold text-slate-900">{item.title}</h3><p className="mt-1 text-xs leading-relaxed text-slate-600">{item.description}</p><a href={item.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-700 hover:underline">{item.sourceLabel}<ExternalLink className="h-3 w-3" /></a></div>
      <select aria-label={`Estado: ${item.title}`} value={item.status} onChange={(event) => onChange({ status: event.target.value as FiscalRequirementStatus })} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold"><option>Pendiente</option><option>Cumplido</option><option>No aplica</option></select></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-[10px] font-semibold text-slate-600"><span>Responsable</span><input value={item.responsible} onChange={(event) => onChange({ responsible: event.target.value })} maxLength={160} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-normal" placeholder="Persona encargada" /></label><label className="space-y-1 text-[10px] font-semibold text-slate-600"><span>Próxima fecha de cumplimiento</span><input type="date" value={item.dueDate} onChange={(event) => onChange({ dueDate: event.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-normal" /></label>
      <label className="space-y-1 text-[10px] font-semibold text-slate-600 sm:col-span-2"><span>Documento de soporte</span><select value={item.evidenceDocumentId} onChange={(event) => onChange({ evidenceDocumentId: event.target.value })} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-normal"><option value="">Sin documento vinculado</option>{documents.map((doc) => <option key={doc.id} value={doc.id}>{doc.title}{doc.fileName ? ` · ${doc.fileName}` : ''}</option>)}</select></label>
      <label className="space-y-1 text-[10px] font-semibold text-slate-600 sm:col-span-2"><span>Observaciones de auditoría (no se muestran en el QR público)</span><textarea value={item.notes} onChange={(event) => onChange({ notes: event.target.value })} maxLength={2000} rows={2} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-normal" placeholder="Anota verificaciones, pendientes o referencias internas" /></label>
    </div>
    <p className="mt-3 text-[10px] text-slate-400">Periodicidad: {item.frequency}</p>
  </article>;
}

function RequirementCard({ item }: { item: FiscalRequirement }) {
  return <article className="rounded-xl border border-slate-200 bg-white p-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><h3 className="text-sm font-bold text-slate-900">{item.title}</h3><p className="mt-1 text-xs leading-relaxed text-slate-600">{item.description}</p><p className="mt-2 text-[11px] text-slate-500">Periodicidad: {item.frequency}{item.dueDate ? ` · Fecha objetivo: ${formatDate(item.dueDate)}` : ''}</p><a href={item.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-700 hover:underline">{item.sourceLabel}<ExternalLink className="h-3 w-3" /></a></div><StatusBadge status={item.status} /></div>
  </article>;
}

function Metric({ icon: Icon, label, value, caption, tone }: { icon: React.ElementType; label: string; value: string; caption: string; tone: string }) {
  const tones: Record<string, string> = { indigo: 'bg-indigo-50 text-indigo-600', amber: 'bg-amber-50 text-amber-700', blue: 'bg-sky-50 text-sky-700', emerald: 'bg-emerald-50 text-emerald-700' };
  return <article className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex items-center justify-between"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p><span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tones[tone]}`}><Icon className="h-4 w-4" /></span></div><p className="mt-3 text-2xl font-black tracking-tight text-slate-900">{value}</p><p className="mt-1 text-[10px] text-slate-500">{caption}</p></article>;
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${statusStyle[status] || statusStyle.Pendiente}`}>{status}</span>;
}

function EmptyState({ icon: Icon, title, text, action }: { icon: React.ElementType; title: string; text: string; action?: React.ReactNode }) {
  return <div className="flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500"><Icon className="h-6 w-6" /></span><h3 className="mt-3 text-sm font-bold text-slate-800">{title}</h3><p className="mt-1 max-w-lg text-xs leading-relaxed text-slate-500">{text}</p>{action}</div>;
}

function readFileDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer el archivo seleccionado.'));
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new Error('El formato del archivo seleccionado no es válido.'));
    reader.readAsDataURL(file);
  });
}

function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('es-VE');
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('es-VE', { dateStyle: 'medium', timeStyle: 'short' });
}
