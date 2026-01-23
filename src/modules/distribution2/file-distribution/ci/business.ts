/**
 * ============================================================
 * PARSE RELEASE → BUILD CI DISTRIBUTION ARTIFACTS
 * ============================================================
 *
 * INPUT
 * ------------------------------------------------------------
 * - releaseId (string)
 *   → dùng để:
 *     + query release metadata + trackCis từ DB
 *     + xác định file zip đầu vào: downloads/{releaseId}.zip
 *
 * - ciOrderId (string)
 *   → định danh 1 batch / job CI
 *   → dùng làm root output folder:
 *     release_parsed/{ciOrderId}/
 *
 * - ZIP file (downloads/{releaseId}.zip)
 *   → chứa:
 *     + 01 cover image (jpg / jpeg / png / tif)
 *     + audio files (wav / flac / aiff)
 *     + file name audio phải match đúng trackCis[].trackFileName
 *
 * - CI Excel template
 *   → src/modules/access-bomb/file/file-ci.xlsx
 *   → sheet: "METADATA TEMPLATE"
 *   → data bắt đầu từ row 15
 *
 *
 * OUTPUT
 * ------------------------------------------------------------
 * Tạo thư mục:
 *   release_parsed/{ciOrderId}/{UPC}/
 *
 * Bên trong gồm:
 *   1) Cover image
 *      - tên file: {UPC}.{ext}
 *      - nếu ảnh < 3000x3000 → resize lên 3000x3000
 *
 *   2) Audio tracks
 *      - mỗi track được rename theo format:
 *        {UPC}_01_{trackNo2Digits}.{ext}
 *      - thứ tự track dựa trên trackNo
 *
 *   3) CI Excel file
 *      - tên file: {UPC}.xlsx
 *      - build từ template + mapping metadata & track data
 *
 *
 * FLOW LOGIC
 * ------------------------------------------------------------
 * 1. Load release metadata từ DB
 *    - nếu không có UPC → skip release
 *
 * 2. Validate input zip tồn tại
 *
 * 3. Unzip downloads/{releaseId}.zip
 *    → tmp folder: download_unzip/{releaseId}/
 *
 * 4. Scan files trong tmp folder
 *    - locate cover image
 *    - locate audio files
 *
 * 5. Process cover image
 *    - copy / resize → output folder
 *
 * 6. Process audio tracks
 *    - map trackCis[] ↔ audio file name
 *    - copy + rename theo chuẩn CI
 *
 * 7. Build CI Excel
 *    - parse release + track metadata → CI rows
 *    - fill template excel từ row 15
 *
 * 8. Cleanup temp folder
 *
 *
 * ASSUMPTIONS / CONSTRAINTS
 * ------------------------------------------------------------
 * - ZIP structure: files nằm trực tiếp ở root (không nested folder)
 * - trackFileName trong DB match chính xác tên file trong zip
 * - mỗi release có đúng 1 cover image hợp lệ
 *
 *
 * SIDE EFFECTS
 * ------------------------------------------------------------
 * - tạo / ghi file lên filesystem
 * - xoá folder tạm sau khi hoàn tất
 *
 *
 * ERROR HANDLING
 * ------------------------------------------------------------
 * - thiếu zip → throw error
 * - thiếu UPC → skip release
 * - thiếu audio / cover → log warning, tiếp tục xử lý
 *
 * ============================================================
 */
