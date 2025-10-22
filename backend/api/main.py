from __future__ import annotations

from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pathlib import Path
import tempfile
import uvicorn
import io
from openpyxl import load_workbook

from backend.services.excel_parser import parse_file
from backend.services.image_extractor import extract_images_for_result
from backend.services import blob_store as blob_service


app = FastAPI(title="ActivityRuleEditor Parser API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/media/{blob_hash}")
def serve_blob(blob_hash: str):
    """供应 blob 存储中的图片"""
    blob_data = blob_service.get_blob(blob_hash)
    if blob_data is None:
        return JSONResponse({"error": "not found"}, status_code=404)

    data, mime, ext = blob_data
    return StreamingResponse(
        io.BytesIO(data),
        media_type=mime,
        headers={
            "Cache-Control": "public, max-age=31536000, immutable",
            "ETag": f'"{blob_hash}"',
            # 允许跨域加载，用于 Canvas 绘图
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
        },
    )


@app.post("/api/parse")
async def parse_excel(
    file: UploadFile = File(...),
    sheet: str | None = Form(None),
):
    """
    解析 Excel 并返回结构化 JSON 和图片引用
    
    统一返回 sheets 结构：
    {
        "ok": true,
        "sheets": {
            "Sheet1": { "result": {...}, "images": {...} }
        },
        "skipped_sheets": [...],
        "blob_store_size": 10
    }
    """
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmpdir_path = Path(tmpdir)
            tmp_xlsx = tmpdir_path / "upload.xlsx"
            tmp_xlsx.write_bytes(await file.read())

            # 统一调用多 sheet 解析
            parse_result = parse_file(str(tmp_xlsx), sheet)
            sheets_data = parse_result["sheets"]
            
            # 为每个有效 sheet 提取图片
            sheets_output = {}
            for sheet_name, sheet_result in sheets_data.items():
                extracted_images = extract_images_for_result(
                    xlsx_path=str(tmp_xlsx),
                    result=sheet_result,
                    sheet_title=sheet_name,
                    put_blob=blob_service.store_blob,
                )
                
                sheets_output[sheet_name] = {
                    "result": sheet_result,
                    "images": extracted_images
                }
            
            sheet_count = len(sheets_data)
            skipped_count = len(parse_result["skipped_sheets"])
            print(f"[后端] 解析完成: {sheet_count} 个有效 sheet, {skipped_count} 个跳过")
            if parse_result["skipped_sheets"]:
                print(f"[后端] 跳过的 sheet: {', '.join(parse_result['skipped_sheets'])}")

            return JSONResponse({
                "ok": True,
                "sheets": sheets_output,
                "skipped_sheets": parse_result["skipped_sheets"],
                "blob_store_size": blob_service.get_store_size(),
            })
    except Exception as e:
        print(f"[后端] 解析错误: {e}")
        import traceback
        traceback.print_exc()
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


# 向后兼容别名（保持旧 URL 可用）
app.add_api_route("/parse", parse_excel, methods=["POST"])


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
