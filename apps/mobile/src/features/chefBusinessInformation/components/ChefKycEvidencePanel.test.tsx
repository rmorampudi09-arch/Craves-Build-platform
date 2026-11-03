import React from 'react';
import renderer, {act} from 'react-test-renderer';
import * as ImagePicker from 'expo-image-picker';
import {chefBusinessInformationApi} from '../api/chefBusinessInformationApi';
import {ChefKycEvidencePanel} from './ChefKycEvidencePanel';

jest.mock('../api/chefBusinessInformationApi', () => ({
  ...jest.requireActual('../api/chefBusinessInformationApi'),
  chefBusinessInformationApi: {listApplicationEvidence: jest.fn(async () => []), uploadProofFile: jest.fn()},
}));

const picker = ImagePicker.launchImageLibraryAsync as jest.Mock;
const evidence = chefBusinessInformationApi as jest.Mocked<typeof chefBusinessInformationApi>;

describe('ChefKycEvidencePanel', () => {
  it('picks the document at quality 0.8, not the original bytes', async () => {
    picker.mockResolvedValueOnce({
      canceled: false,
      assets: [{uri: 'file:///id-front.jpg', fileName: 'id-front.jpg', mimeType: 'image/jpeg', fileSize: 1_000_000}],
    });
    evidence.uploadProofFile.mockResolvedValue({} as never);
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<ChefKycEvidencePanel applicationStatus="PENDING" />);
    });

    const upload = tree.root.findAll(node => node.props.accessibilityLabel === 'Upload Government ID · front' && node.props.onPress)[0];
    await act(async () => {
      await upload.props.onPress();
    });

    expect(picker).toHaveBeenCalledWith(expect.objectContaining({quality: 0.8}));
  });
});
