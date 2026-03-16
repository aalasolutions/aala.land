import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, FindOptionsWhere } from 'typeorm';
import { Contact } from './entities/contact.entity';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';

@Injectable()
export class ContactsService {
  constructor(
    @InjectRepository(Contact)
    private readonly contactRepository: Repository<Contact>,
  ) {}

  async create(companyId: string, dto: CreateContactDto): Promise<Contact> {
    const contact = this.contactRepository.create({ ...dto, companyId });
    return this.contactRepository.save(contact);
  }

  async findAll(
    companyId: string,
    page = 1,
    limit = 20,
    search?: string,
  ): Promise<{ data: Contact[]; total: number; page: number; limit: number }> {
    const where: FindOptionsWhere<Contact>[] = [];

    if (search) {
      const pattern = `%${search}%`;
      where.push(
        { companyId, firstName: ILike(pattern) },
        { companyId, lastName: ILike(pattern) },
        { companyId, email: ILike(pattern) },
        { companyId, phone: ILike(pattern) },
      );
    } else {
      where.push({ companyId });
    }

    const [data, total] = await this.contactRepository.findAndCount({
      where,
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    return { data, total, page, limit };
  }

  async findOne(id: string, companyId: string): Promise<Contact> {
    const contact = await this.contactRepository.findOne({
      where: { id, companyId },
      relations: ['lead'],
    });
    if (!contact) {
      throw new NotFoundException('Contact not found');
    }
    return contact;
  }

  async update(id: string, companyId: string, dto: UpdateContactDto): Promise<Contact> {
    const contact = await this.findOne(id, companyId);
    Object.assign(contact, dto);
    return this.contactRepository.save(contact);
  }

  async remove(id: string, companyId: string): Promise<void> {
    const contact = await this.findOne(id, companyId);
    await this.contactRepository.remove(contact);
  }
}
