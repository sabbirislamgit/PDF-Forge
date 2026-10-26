export interface PDFRect {
  x: number; // PDF points (from left)
  y: number; // PDF points (from bottom in standard PDF)
  width: number;
  height: number;
}

export interface ViewportRect {
  x: number; // pixels from page left
  y: number; // pixels from page top
  width: number;
  height: number;
}

export type ViewMode = 'single' | 'continuous';

export type PDFObjectType = 'image' | 'text' | 'vector';

export type TextAlign = 'left' | 'center' | 'right';
export type FontWeight = 'normal' | 'bold';
export type FontStyle = 'normal' | 'italic';

export interface ObjectSignature {
  objectType: PDFObjectType;
  bounds: PDFRect;
  width: number;
  height: number;
  aspectRatio: number;
  imageHash?: string;
  vectorSignature?: string;
  textContent?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: FontWeight;
  fontStyle?: FontStyle;
  color?: string;
  pdfObjectId?: string;
  layerType?: 'watermark' | 'page-number' | 'header-footer' | 'ocr' | 'drawing' | 'added-text' | 'added-image';
}

export interface PDFObject {
  id: string;
  pageIndex: number; // 0-indexed
  type: PDFObjectType;
  bounds: PDFRect; // in standard PDF points (x, y from bottom-left)
  // For images & vectors
  imageDataUrl?: string;
  originalWidth?: number;
  originalHeight?: number;
  imageHash?: string;
  vectorSignature?: string;
  pdfObjectId?: string;
  isFullPageBackground?: boolean;
  // For text
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: FontWeight;
  fontStyle?: FontStyle;
  underline?: boolean;
  textAlign?: TextAlign;
  letterSpacing?: number; // px spacing
  lineHeight?: number; // line height multiplier (e.g. 1.25)
  color?: string; // hex color e.g. '#111827'
  // For freehand drawings
  strokeColor?: string;
  strokeWidth?: number;
  // Sampled local background behind original object for seamless cover-up
  backgroundColor?: string;
  // Attributes
  rotation?: number; // degrees (-180..360)
  opacity?: number; // 0..1 (default 1)
  layerType?: 'watermark' | 'page-number' | 'header-footer' | 'ocr' | 'drawing' | 'added-text' | 'added-image';
  forceBackgroundCover?: boolean; // when true on a new object (e.g. OCR), draws backgroundColor cover rect over underlying raster text
  isNew?: boolean; // newly pasted, moved, resized, or edited object
  sourceObjectId?: string; // ID of original PDF object if derived from one
  label?: string;
}

export type DocumentLayerScope = 'current' | 'all';

export type OcrLanguage = 'eng+ben' | 'eng' | 'ben';

export interface TextSearchMatch {
  objectId: string;
  pageIndex: number;
  text: string;
  matchCountInObject: number;
}

export type WatermarkPosition =
  | 'center'
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export interface WatermarkConfig {
  mode: 'text' | 'image';
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: FontWeight;
  color: string;
  imageDataUrl?: string;
  imageWidth?: number;
  imageHeight?: number;
  scale: number; // 0.2 to 2.0
  opacity: number; // 0.1 to 1.0
  rotation: number; // -90 to 90 degrees
  position: WatermarkPosition;
  scope: DocumentLayerScope;
}

export type PageNumberPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export type PageNumberFormat = '1' | '01' | 'Page 1' | 'Page 1 of N' | '1 / N';

export interface PageNumberConfig {
  position: PageNumberPosition;
  format: PageNumberFormat;
  startNumber: number;
  fontFamily: string;
  fontSize: number;
  fontWeight: FontWeight;
  color: string;
  margin: number; // PDF points from page edge
  scope: DocumentLayerScope;
}

export interface HeaderFooterConfig {
  headerLeft: string;
  headerCenter: string;
  headerRight: string;
  footerLeft: string;
  footerCenter: string;
  footerRight: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: FontWeight;
  color: string;
  marginTop: number; // PDF points from top edge
  marginBottom: number; // PDF points from bottom edge
  marginX: number; // PDF points from left/right edges
  scope: DocumentLayerScope;
}

export interface ObjectMatch {
  object: PDFObject;
  similarity: number; // 0 to 1
  pageIndex: number;
  isExact: boolean;
  signature?: ObjectSignature;
}

export interface ReplacementData {
  type: 'image' | 'text';
  imageDataUrl?: string;
  imageFormat?: 'png' | 'jpg';
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: FontWeight;
  fontStyle?: FontStyle;
  underline?: boolean;
  textAlign?: TextAlign;
  letterSpacing?: number;
  lineHeight?: number;
  color?: string;
  rotation?: number;
  opacity?: number;
}

export interface ReplacedObjectEntry {
  originalObjectId: string;
  replacement: ReplacementData;
  bounds: PDFRect;
  rotation?: number;
  opacity?: number;
}

export type AnnotationType =
  | 'note'
  | 'highlight'
  | 'underline'
  | 'strikeout'
  | 'text'
  | 'rect'
  | 'circle'
  | 'arrow'
  | 'pencil';

export interface AnnotationItem {
  id: string;
  pageIndex: number;
  type: AnnotationType;
  bounds: PDFRect; // in PDF points (x, y from bottom-left)
  color: string;
  strokeWidth?: number;
  opacity?: number;
  fillColor?: string;
  text?: string;
  author?: string;
  createdAt: number;
  points?: { x: number; y: number }[]; // For freehand pencil or arrow endpoints
}

export interface PDFProtectionConfig {
  enabled: boolean;
  userPassword?: string;
  ownerPassword?: string;
  permissions: {
    printing: boolean;
    copying: boolean;
    modifying: boolean;
    annotating: boolean;
  };
}

export interface PageModifications {
  removedObjectIds: string[];
  replacedObjects: ReplacedObjectEntry[];
  pastedObjects: PDFObject[];
  annotations?: AnnotationItem[];
}

export interface DocumentModifications {
  [pageIndex: number]: PageModifications;
}

export type BlankPagePosition = 'before' | 'after' | 'start' | 'end';
export type BlankPageSizePreset = 'match' | 'a4' | 'letter';

export interface BlankPageConfig {
  position: BlankPagePosition;
  sizePreset: BlankPageSizePreset;
  width: number;
  height: number;
  backgroundColor: string; // '#ffffff', '#000000', 'transparent', or custom hex color
}

export interface PageInfo {
  id?: string; // Stable unique identifier across page reordering/insertions
  pageIndex: number; // Current 0-indexed position in document
  pageNumber: number; // Current 1-indexed page number
  width: number; // Current effective width in PDF points
  height: number; // Current effective height in PDF points
  thumbnailDataUrl?: string;
  // Page Management attributes
  originalPageIndex?: number | null; // Original 0-indexed page in source PDF (null for blank pages)
  isBlankPage?: boolean;
  backgroundColor?: string; // '#ffffff', '#000000', 'transparent', or hex
  rotation?: number; // Additional rotation in degrees (0, 90, 180, 270)
  baseWidth?: number; // Unrotated width in PDF points
  baseHeight?: number; // Unrotated height in PDF points
}
