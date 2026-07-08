import Component from '@glimmer/component';
import { AMENITY_OPTIONS } from 'land/constants';

export default class UnitAmenitiesPrint extends Component {
  get prettyAmenities() {
    const amenities = this.args.amenities;
    const amenityList = Array.isArray(amenities) ? amenities : [];

    return amenityList.map((key) => {
      const option = AMENITY_OPTIONS.find((opt) => opt.key === key);
      if (option) return option;

      const label = String(key)
        .split('_')
        .map(
          (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
        )
        .join(' ');

      return { label, icon: 'circle' };
    });
  }
}
