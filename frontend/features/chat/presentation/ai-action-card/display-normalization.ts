import type { AIActionDisplay } from "@/features/chat/domain/ai-action-drafts";

const TEXT_TRANSLATIONS: Record<string, string> = {
  "Activity": "Hoạt động",
  "Activity · Activity": "Hoạt động · Hoạt động",
  "Activity · Accommodation": "Hoạt động · Lưu trú",
  "Activity · Check-in / Check-out": "Hoạt động · Check-in / Check-out",
  "Activity · Food": "Hoạt động · Ăn uống",
  "Activity · Free Time": "Hoạt động · Thời gian tự do",
  "Activity · Nightlife": "Hoạt động · Giải trí đêm",
  "Activity · Other": "Hoạt động · Khác",
  "Activity · Shopping": "Hoạt động · Mua sắm",
  "Activity · Sightseeing": "Hoạt động · Tham quan",
  "Activity · Transportation": "Hoạt động · Di chuyển",
  "AI action": "Thao tác AI",
  "All day": "Cả ngày",
  "Activity details": "Chi tiết hoạt động",
  "Activity type": "Loại hoạt động",
  "Assigned member": "Thành viên được giao",
  "Amount": "Số tiền",
  "Booking": "Mã đặt chỗ",
  "Cancelled": "Đã hủy",
  "Collected by": "Người thu",
  "Collector": "Người thu",
  "Contact": "Liên hệ",
  "Contact phone": "Số điện thoại",
  "Contributions": "Đóng góp",
  "Custom activity type": "Loại hoạt động tùy chỉnh",
  "Delete activity": "Xóa hoạt động",
  "Delete expense": "Xóa chi phí",
  "Description": "Mô tả",
  "Done": "Hoàn tất",
  "End time": "Giờ kết thúc",
  "Expense": "Chi phí",
  "Expense contributions": "Đóng góp chi phí",
  "Failed": "Thất bại",
  "Flexible": "Linh hoạt",
  "From": "Người chuyển",
  "In Progress": "Đang thực hiện",
  "Link": "Liên kết",
  "Location note": "Ghi chú địa điểm",
  "Location mode": "Kiểu địa điểm",
  "Mark all participants paid": "Ghi nhận mọi người đã đóng đủ",
  "Meeting point": "Điểm hẹn",
  "Member": "Thành viên",
  "Member contributions": "Đóng góp theo thành viên",
  "Money transfer": "Chuyển tiền",
  "Needs info": "Cần thêm thông tin",
  "Note": "Ghi chú",
  "Place": "Địa điểm",
  "Ready": "Sẵn sàng",
  "Settlement": "Quyết toán",
  "Start time": "Giờ bắt đầu",
  "Status": "Trạng thái",
  "Time": "Thời gian",
  "Time mode": "Kiểu thời gian",
  "Timeline date": "Ngày lịch trình",
  "Timeline day": "Ngày trong lịch trình",
  "Title": "Tiêu đề",
  "To": "Người nhận",
  "Transfer": "Khoản chuyển",
  "Trip settlement": "Quyết toán chuyến đi",
  "Unassigned": "Chưa phân công",
  "Upcoming": "Sắp diễn ra",
  "Update expense": "Cập nhật chi phí",
  "Update expense contributions": "Cập nhật đóng góp chi phí",
  "Whole group": "Cả nhóm",
};

const GENERIC_TITLE_TRANSLATIONS: Record<string, string> = {
  "Activity": "Hoạt động",
  "AI action": "Thao tác AI",
  "Expense": "Chi phí",
  "Mark all participants paid": "Ghi nhận mọi người đã đóng đủ",
  "Money transfer": "Chuyển tiền",
  "Trip settlement": "Quyết toán chuyến đi",
};

export function translateLegacyActionText(
  value: string | undefined,
): string | undefined {
  if (!value) return value;
  const translated = TEXT_TRANSLATIONS[value];
  if (translated) return translated;
  const transfer = value.match(/^Transfer from (.+) to (.+)$/);
  if (transfer) return `${transfer[1]} chuyển cho ${transfer[2]}`;
  return value;
}

function translateLegacyDisplayTitle(value: string | undefined): string {
  if (!value) return "";
  const translated = GENERIC_TITLE_TRANSLATIONS[value];
  if (translated) return translated;
  const transfer = value.match(/^Transfer from (.+) to (.+)$/);
  if (transfer) return `${transfer[1]} chuyển cho ${transfer[2]}`;
  return value;
}

export function normalizeActionDisplay(display: AIActionDisplay): AIActionDisplay {
  return {
    ...display,
    kicker: translateLegacyActionText(display.kicker) ?? display.kicker,
    title: translateLegacyDisplayTitle(display.title),
    chips: display.chips?.map((chip) => ({
      ...chip,
      label: translateLegacyActionText(chip.label) ?? chip.label,
    })),
    meta: display.meta?.map((item) => ({
      ...item,
      label: translateLegacyActionText(item.label) ?? item.label,
      value: translateLegacyActionText(item.value) ?? item.value,
    })),
  };
}
