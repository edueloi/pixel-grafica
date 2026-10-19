// Kit de UI (mesmo padrão visual do MFC). Telas importam tudo daqui.
export { Button, IconButton } from './Button';
export { Modal, ModalFooter, ConfirmModal } from './Modal';
export type { ModalProps } from './Modal';

export { Input, Textarea, Select } from './Input';
export { Switch } from './Switch';
export { DatePicker } from './DatePicker';
export { Calendar } from './Calendar';
export { Combobox } from './Combobox';
export type { ComboboxOption } from './Combobox';
export { FileUpload } from './FileUpload';
export type { UploadedFileItem } from './FileUpload';
export { TokenTextarea } from './TokenTextarea';

export { Toast, ToastProvider, useToast } from './Toast';
export type { ToastType } from './Toast';
export { Badge, StatusBadge, PaymentBadge } from './Badge';
export { Alert } from './Alert';
export type { AlertProps } from './Alert';
export { uiTheme } from './theme';

export { PageWrapper, SectionTitle, StatGrid, ContentCard, FormRow, Divider } from './PageWrapper';
export { PanelCard } from './PanelCard';
export { DetailField } from './DetailField';
export { Tabs } from './Tabs';
export { EmptyState } from './EmptyState';

export { StatCard } from './StatCard';
export { GridTable } from './GridTable';
export type { Column, GridTableProps } from './GridTable';
export { Pagination, usePagination } from './Pagination';

export {
  FilterLine, FilterLineSection, FilterLineItem, FilterLineGroup, FilterLineSegmented, FilterLineViewToggle, FilterLineSearch, FilterLineDateRange,
} from './FilterLine';
