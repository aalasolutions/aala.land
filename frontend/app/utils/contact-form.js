// Shared between ContactsIndexController's edit-mode save and
// ContactsDetailController's save so the form<->DTO mapping only exists once.
export function contactToFormFields(contact) {
  return {
    formFirstName: contact?.firstName ?? '',
    formLastName: contact?.lastName ?? '',
    formEmail: contact?.email ?? '',
    formPhone: contact?.phone ?? '',
    formIsWhatsapp: !!contact?.isWhatsapp,
    formNationality: contact?.nationality ?? '',
    formNationalId: contact?.nationalId ?? '',
    formContactCompany: contact?.contactCompany ?? '',
    formJobTitle: contact?.jobTitle ?? '',
    formAddress: contact?.address ?? '',
    formNotes: contact?.notes ?? '',
  };
}

export function contactFormToBody(controller) {
  return {
    firstName: controller.formFirstName || null,
    lastName: controller.formLastName || null,
    email: controller.formEmail || null,
    phone: controller.formPhone || null,
    isWhatsapp: controller.formIsWhatsapp,
    nationality: controller.formNationality || null,
    nationalId: controller.formNationalId || null,
    contactCompany: controller.formContactCompany || null,
    jobTitle: controller.formJobTitle || null,
    address: controller.formAddress || null,
    notes: controller.formNotes || null,
  };
}
