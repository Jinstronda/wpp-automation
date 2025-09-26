import fs from 'fs';
import path from 'path';
export function readLeadsCsv(csvPath) {
    const abs = path.isAbsolute(csvPath) ? csvPath : path.join(process.cwd(), csvPath);
    if (!fs.existsSync(abs))
        return [];
    const raw = fs.readFileSync(abs, 'utf8');
    const lines = raw.split(/\r?\n/).filter(Boolean);
    const [headerLine, ...rows] = lines;
    if (!headerLine)
        return [];
    const headers = headerLine.split(',').map((h) => h.trim());
    const nameIdx = headers.indexOf('name');
    const phoneIdx = headers.indexOf('phone');
    const businessIdx = headers.indexOf('businessName');
    const promptIdx = headers.indexOf('promptVariant');
    const out = [];
    for (const row of rows) {
        const cols = row.split(',');
        if (cols.length < 3)
            continue;
        out.push({
            name: (cols[nameIdx] || '').trim(),
            phone: (cols[phoneIdx] || '').trim(),
            businessName: (cols[businessIdx] || '').trim(),
            promptVariant: promptIdx >= 0 ? (cols[promptIdx] || '').trim() : undefined
        });
    }
    return out;
}
export function ensureJsonFile(filePath, fallback) {
    const abs = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
    if (!fs.existsSync(abs)) {
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, JSON.stringify(fallback, null, 2));
    }
}
export function readJsonFile(filePath, fallback) {
    const abs = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
    try {
        if (!fs.existsSync(abs))
            return fallback;
        return JSON.parse(fs.readFileSync(abs, 'utf8'));
    }
    catch {
        return fallback;
    }
}
export function writeJsonFile(filePath, data) {
    const abs = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, JSON.stringify(data, null, 2));
}
